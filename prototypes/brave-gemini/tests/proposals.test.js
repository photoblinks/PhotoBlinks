// Requirement 2: unverified fields keep the existing data EXACTLY; only fully verified values
// become pending proposals; nothing is approved or applied automatically.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildProposals, isProposable } = require('../proposals');
const { createSearcher } = require('../brave');
const { createTracker } = require('../cost');
const { createCache } = require('../cache');
const { createPageGetter } = require('../page-fetch');
const { processLocation } = require('../pipeline');
const { createDryRunNetwork } = require('../dry-run-fixtures');
const { LOCATIONS } = require('../locations');
const { getPricing } = require('../../../gemini-pricing');
const cfg = require('../config');

const verified = (value, extra = {}) => ({ verified: true, reason: null, value, quote: 'an exact quote from the page', source_url: 'https://asi.nic.in/x', tier: 'official', ...extra });
const rejected = reason => ({ verified: false, reason, value: null, model_value: 'a guess', quote: null, source_url: null });

const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };

const EXISTING = { pre_wedding_shoot: 'allowed', drone_status: 'restricted', prior_booking: 'Call the office', drone_permission: '', entry_fee: '₹30', shoot_permit_fee: null };

test('only fully verified, changed values become proposals; everything else is kept', () => {
  const location = deepFreeze({ name: 'X', existing: { ...EXISTING } });
  const { proposals, preserved } = buildProposals(location, {
    pre_wedding_shoot: verified('conditional'),
    drone_status: rejected('value_not_supported_by_quote'),
    prior_booking: rejected('unknown_value'),
    drone_permission: rejected('value_adds_text'),
    entry_fee: verified('₹40'),
    shoot_permit_fee: rejected('quote_off_topic'),
  });
  assert.deepEqual(proposals.map(p => p.field).sort(), ['entry_fee', 'pre_wedding_shoot']);
  assert.deepEqual(preserved.map(p => p.field).sort(), ['drone_permission', 'drone_status', 'prior_booking', 'shoot_permit_fee']);
});

test('REGRESSION: unverified fields echo the existing value exactly (null, empty string, text) and never a replacement', () => {
  const location = deepFreeze({ name: 'X', existing: { ...EXISTING } });
  const { preserved } = buildProposals(location, {
    drone_status: rejected('unknown_value'), prior_booking: rejected('x'), drone_permission: rejected('x'), shoot_permit_fee: rejected('x'),
  });
  const by = Object.fromEntries(preserved.map(p => [p.field, p]));
  assert.equal(by.drone_status.existing_value, 'restricted');
  assert.equal(by.prior_booking.existing_value, 'Call the office');
  assert.strictEqual(by.drone_permission.existing_value, '');   // empty string stays an empty string
  assert.strictEqual(by.shoot_permit_fee.existing_value, null); // null stays null
  for (const p of preserved) { assert.equal(p.action, 'keep_existing'); assert.equal(p.has_existing_value, true); }
});

test('the location object is never modified (existing data preserved exactly)', () => {
  const location = { name: 'X', existing: { ...EXISTING } };
  const before = structuredClone(location);
  buildProposals(location, { entry_fee: verified('₹40'), drone_status: rejected('x') });
  assert.deepEqual(location, before);
  assert.throws(() => { 'use strict'; deepFreeze({ existing: { a: 1 } }).existing.a = 2; }); // frozen input would throw on any write
  assert.doesNotThrow(() => buildProposals(deepFreeze({ name: 'X', existing: { ...EXISTING } }), { entry_fee: verified('₹40') }));
});

test('a field with no existing value is kept as "no value": null is reported, never invented', () => {
  const { preserved } = buildProposals({ name: 'X' }, { drone_status: rejected('unknown_value') });
  const p = preserved.find(x => x.field === 'drone_status');
  assert.equal(p.has_existing_value, false);
  assert.strictEqual(p.existing_value, null);
});

test('never proposes null, empty, unknown or unverified values even if a result is wrongly marked verified', () => {
  for (const bad of [null, undefined, '', '   ', 'unknown', 'Unverified', 'null', 'n/a', 42, {}, []]) {
    assert.equal(isProposable(verified(bad)), false, String(bad));
    const { proposals } = buildProposals({ name: 'X', existing: EXISTING }, { entry_fee: verified(bad) });
    assert.equal(proposals.length, 0, String(bad));
  }
});

test('incomplete evidence is not proposable (missing quote or source)', () => {
  assert.equal(isProposable(verified('₹40', { quote: null })), false);
  assert.equal(isProposable(verified('₹40', { quote: '  ' })), false);
  assert.equal(isProposable(verified('₹40', { source_url: null })), false);
  assert.equal(isProposable({ ...verified('₹40'), verified: 'true' }), false); // must be exactly true
  assert.equal(isProposable(undefined), false);
});

test('an invalid enum value is never proposed', () => {
  const { proposals, preserved } = buildProposals({ name: 'X', existing: EXISTING }, { drone_status: verified('banned') });
  assert.equal(proposals.length, 0);
  assert.equal(preserved.find(p => p.field === 'drone_status').reason, 'invalid_enum');
});

test('a verified value equal to the existing value creates no proposal', () => {
  const { proposals, preserved } = buildProposals({ name: 'X', existing: { entry_fee: '₹40' } }, { entry_fee: verified(' ₹40 ') });
  assert.equal(proposals.length, 0);
  assert.equal(preserved.find(p => p.field === 'entry_fee').reason, 'unchanged');
});

test('proposals are pending and need manual review; nothing is approved or applied', () => {
  const { proposals } = buildProposals({ name: 'X', existing: EXISTING }, { entry_fee: verified('₹40'), pre_wedding_shoot: verified('conditional') });
  assert.ok(proposals.length === 2);
  for (const p of proposals) {
    assert.equal(p.review_status, 'pending');
    assert.equal(p.requires_manual_review, true);
    assert.ok(p.evidence.quote && p.evidence.source_url);
    assert.equal(Object.isFrozen(p), true);
  }
  assert.doesNotMatch(JSON.stringify(proposals), /approv|applied|published/i);
  assert.equal(proposals.find(p => p.field === 'entry_fee').based_on_existing_value, '₹30'); // lets a reviewer see/guard staleness
});

// ---- end to end through the pipeline ----

const tmpCache = () => createCache(fs.mkdtempSync(path.join(os.tmpdir(), 'bg-prop-test-')));

async function run(location, answer) {
  const net = createDryRunNetwork();
  const cache = tmpCache();
  const tracker = createTracker({ limitInr: cfg.TEST_BUDGET_INR, pricing: getPricing(cfg.MODEL) });
  const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
  const searcher = createSearcher({ apiKey: 'dry', fetchImpl: net.fetchImpl, cache, tracker });
  const callLlm = async () => ({ text: JSON.stringify(answer), usage: { inputTokens: 1000, outputTokens: 200 } });
  return processLocation(location, { searcher, getPage, callLlm, tracker, cache });
}

const PAGE_URL = 'https://karnatakatourism.org/palace';

test('pipeline: a partly correct model answer yields proposals ONLY for fully verified fields; existing data untouched', async () => {
  const location = { ...LOCATIONS[0], existing: { ...EXISTING } };
  const before = structuredClone(location);
  const f = (value, quote) => ({ value, quote, source_url: PAGE_URL });
  const record = await run(location, {
    fields: {
      entry_fee: f('₹40', 'Entry fee: ₹40 per person for Indian nationals.'),                                   // fully verified
      drone_status: f('prohibited', 'Drone flying is prohibited without permission from the local authority and DGCA clearance.'), // verified
      drone_permission: f('DGCA registration and prior permissions required for specific zones', 'Drone flying requires permission from the local authority and DGCA clearance.'), // unsupported additions
      shoot_permit_fee: f('₹750', 'the shoot permit fee is ₹750 per day, waived for weddings'),                  // quote not on page
      prior_booking: f('unknown', null),                                                                         // unknown
      pre_wedding_shoot: { value: 'allowed', quote: null, source_url: null },                                    // no evidence
    },
    summary: 's',
  });
  assert.deepEqual(record.proposals.map(p => p.field).sort(), ['drone_status', 'entry_fee']);
  const kept = Object.fromEntries(record.preserved.map(p => [p.field, p]));
  assert.equal(kept.drone_permission.reason, 'value_not_an_excerpt');
  assert.equal(kept.shoot_permit_fee.reason, 'quote_not_in_page');
  assert.equal(kept.pre_wedding_shoot.existing_value, 'allowed');
  assert.strictEqual(kept.shoot_permit_fee.existing_value, null);
  assert.strictEqual(kept.drone_permission.existing_value, '');
  assert.deepEqual(location, before);
  for (const p of record.proposals) assert.equal(p.review_status, 'pending');
});

test('pipeline: unparseable or empty model output produces no proposals and keeps every existing value', async () => {
  const location = { ...LOCATIONS[0], existing: { ...EXISTING } };
  const record = await run(location, { nothing: true });
  assert.equal(record.proposals.length, 0);
  assert.equal(record.preserved.length, 6);
  assert.deepEqual(Object.fromEntries(record.preserved.map(p => [p.field, p.existing_value])), EXISTING);
});

test('pipeline: no usable source pages means no proposals and no changes', async () => {
  const hampi = { ...LOCATIONS[3], existing: { ...EXISTING } }; // the dry-run scenario with no allowlisted sources
  const record = await run(hampi, { fields: {} });
  assert.equal(record.llm, null);
  assert.equal(record.proposals.length, 0);
  assert.deepEqual(Object.fromEntries(record.preserved.map(p => [p.field, p.existing_value])), EXISTING);
});

test('the prototype contains no approval or write-to-location code path', () => {
  const src = ['proposals.js', 'pipeline.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\.insert\(|\.upsert\(|\.rpc\(|\.from\(|approve/i);
});
