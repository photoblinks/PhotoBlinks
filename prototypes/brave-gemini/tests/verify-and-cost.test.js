const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyFields, normalizeText, quoteInPage, amountInText, feeValueSupported, pageMentionsLocation } = require('../verify');
const { createTracker, BudgetError } = require('../cost');
const { createCache } = require('../cache');
const { getPricing } = require('../../../gemini-pricing');
const cfg = require('../config');

const LOC = { name: 'Hampi Heritage Site', city_name: 'Hampi', state_name: 'Karnataka' };
const URL1 = 'https://asi.nic.in/hampi';
const PAGE = {
  url: URL1,
  tier: 'official',
  text: 'Hampi monuments. Entry fee: ₹40 per person for Indian nationals.\nProfessional photography and pre-wedding shoots require prior permission; the shoot permit fee is Rs. 1,500 per day.\nDrone flying is prohibited without DGCA clearance.\nDrone flying requires DGCA clearance.\nAdvance booking is required for photography permission.',
};
const f = (value, quote, source_url = URL1) => ({ value, quote, source_url });
const GOOD = {
  pre_wedding_shoot: f('conditional', 'Professional photography and pre-wedding shoots require prior permission'),
  prior_booking: f('Advance booking', 'Advance booking is required for photography permission.'),
  drone_status: f('prohibited', 'Drone flying is prohibited without DGCA clearance.'),
  drone_permission: f('DGCA clearance', 'Drone flying requires DGCA clearance.'),
  entry_fee: f('₹40', 'Entry fee: ₹40 per person for Indian nationals.'),
  shoot_permit_fee: f('₹1500', 'the shoot permit fee is Rs. 1,500 per day'),
};
const verify = fields => verifyFields(LOC, fields, [PAGE]);

test('normalizeText / quoteInPage: case, spacing, curly quotes, currency and thousands separators', () => {
  assert.equal(quoteInPage('ENTRY   fee: ₹40', PAGE.text), true);
  assert.equal(quoteInPage('shoot permit fee is ₹1500 per day', PAGE.text), true); // Rs. 1,500 == ₹1500
  assert.equal(quoteInPage('permit fee is ₹150 per day', PAGE.text), false);
  assert.equal(quoteInPage('', PAGE.text), false);
  assert.equal(normalizeText('“Fee” – ₹1,200'), '"fee" - rs1200');
});

test('amountInText: whole-number match only ("40" is not in "400", "2040" or "4.0")', () => {
  assert.equal(amountInText('40', 'fee ₹40 only'), true);
  assert.equal(amountInText('40', 'fee ₹400 only'), false);
  assert.equal(amountInText('40', 'since 2040'), false);
  assert.equal(amountInText('40', 'ratio 4.0'), false);
  assert.equal(amountInText('40', 'fee ₹40.50'), false);
  assert.equal(amountInText('1500', 'Rs. 1,500 per day'), true);
});

test('feeValueSupported: every amount must appear; "free" needs free wording', () => {
  assert.equal(feeValueSupported('₹40', 'Entry fee ₹40'), true);
  assert.equal(feeValueSupported('₹40 Indians, ₹600 foreigners', 'Entry ₹40 for Indians'), false);
  assert.equal(feeValueSupported('free', 'Entry is free for all'), true);
  assert.equal(feeValueSupported('free', 'Entry ₹40'), false);
  assert.equal(feeValueSupported('unknown', 'free'), false);
});

test('pageMentionsLocation: needs a distinctive name word; generic words alone do not count', () => {
  assert.equal(pageMentionsLocation('Visit Hampi today', LOC), true);
  assert.equal(pageMentionsLocation('A heritage site with grounds', LOC), false);
});

test('verifyFields: all six verified when quotes are real, on-topic and amounts match', () => {
  const r = verify(GOOD);
  assert.equal(Object.values(r.fieldVerified).filter(Boolean).length, 6);
  assert.equal(r.proposed.entry_fee, '₹40');
  assert.equal(r.confidence, 0.95);
  assert.equal(r.results.entry_fee.tier, 'official');
});

test('verifyFields rejects: fabricated quote, wrong amount, unfetched source, bad enum, unknown value, short quote', () => {
  const cases = {
    fabricated: [{ ...GOOD, shoot_permit_fee: f('₹1500', 'the shoot permit fee is Rs. 1,500 per day, waived for weddings') }, 'shoot_permit_fee', 'quote_not_in_page'],
    amount: [{ ...GOOD, entry_fee: f('₹400', 'Entry fee: ₹40 per person for Indian nationals.') }, 'entry_fee', 'amount_not_in_quote'],
    unfetched: [{ ...GOOD, entry_fee: f('₹40', 'Entry fee: ₹40 per person for Indian nationals.', 'https://asi.nic.in/other') }, 'entry_fee', 'source_not_fetched'],
    enum: [{ ...GOOD, drone_status: f('banned', 'Drone flying is prohibited without DGCA clearance.') }, 'drone_status', 'invalid_enum'],
    unknown: [{ ...GOOD, entry_fee: f('unknown', null) }, 'entry_fee', 'unknown_value'],
    shortQuote: [{ ...GOOD, entry_fee: f('₹40', 'fee ₹40') }, 'entry_fee', 'bad_quote'],
    offTopic: [{ ...GOOD, drone_status: f('prohibited', 'Hampi monuments.') }, 'drone_status', 'quote_off_topic'],
  };
  for (const [name, [fields, field, reason]] of Object.entries(cases)) {
    const r = verify(fields);
    assert.equal(r.fieldVerified[field], false, name);
    assert.equal(r.results[field].reason, reason, name);
    assert.equal(r.proposed[field], null, name);
  }
});

test('verifyFields: a fee quoted from a page about another place is rejected; missing output is explicit', () => {
  const other = { url: URL1, text: 'Goa beach. Entry fee: ₹40 per person for Indian nationals.' };
  const r = verifyFields(LOC, { entry_fee: f('₹40', 'Entry fee: ₹40 per person for Indian nationals.') }, [other]);
  assert.equal(r.results.entry_fee.reason, 'page_not_about_location');
  const none = verifyFields(LOC, null, []);
  assert.equal(none.results.entry_fee.reason, 'no_model_output');
  assert.equal(none.confidence, 0);
});

test('verifyFields: a 4-field result scores lower confidence than 6 (verified fields only)', () => {
  const four = verify({ ...GOOD, entry_fee: f('unknown', null), shoot_permit_fee: f('unknown', null) });
  assert.ok(four.confidence > 0 && four.confidence < verify(GOOD).confidence);
});

// ---- budget ----

test('tracker: reservation blocks a call that cannot fit; settle replaces the reservation with actual cost', () => {
  const t = createTracker({ limitInr: 1, pricing: getPricing(cfg.MODEL) });
  const r1 = t.reserve('brave', 0.4);
  const r2 = t.reserve('brave', 0.4);
  assert.throws(() => t.reserve('brave', 0.4), BudgetError); // 0.8 reserved + 0.4 > 1
  t.settle(r1, 0.1);
  t.settle(r2, 0.1);
  assert.ok(Math.abs(t.spentInr - 0.2) < 1e-9);
  assert.equal(t.reservedInr, 0);
  t.reserve('brave', 0.8); // fits again
  assert.throws(() => t.reserve('brave', 0.1), BudgetError);
  t.settle(r1, 5); // double-settle is ignored
  assert.ok(Math.abs(t.spentInr - 0.2) < 1e-9);
});

test('cost model: worst case per location fits ₹2 and 5 locations fit the ₹10 test budget', () => {
  const pricing = getPricing(cfg.MODEL, new Date('2026-11-20T00:00:00Z'));
  const t = createTracker({ limitInr: cfg.TEST_BUDGET_INR, pricing });
  const maxPromptChars = cfg.MAX_PAGES_PER_LOCATION * cfg.EXCERPT_CHARS_PER_PAGE + 3000; // excerpts + instructions
  const llmWorst = t.estimateLlmCostInr(maxPromptChars);
  const perLocation = cfg.MAX_SEARCHES_PER_LOCATION * t.braveCostInr + llmWorst;
  assert.ok(perLocation < 2, `per-location worst case ₹${perLocation.toFixed(3)}`);
  assert.ok(perLocation * 5 < cfg.TEST_BUDGET_INR, `5-location worst case ₹${(perLocation * 5).toFixed(3)}`);
  // official flash-lite prices: $0.25 in / $1.50 out per 1M tokens
  const c = t.llmCostInr({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.ok(Math.abs(c - (0.25 + 1.5) * pricing.usdToInr) < 1e-6);
});

// ---- cache ----

test('cache: round trip, key normalization, TTL expiry, unknown kind rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-cache-test-'));
  let now = 1_000_000;
  const cache = createCache(dir, { now: () => now });
  assert.equal(cache.get('search', 'Fort Kochi fee'), undefined);
  cache.set('search', 'Fort Kochi fee', [{ url: 'x' }]);
  assert.deepEqual(cache.get('search', '  fort   KOCHI fee '), [{ url: 'x' }]);
  now += (cfg.CACHE_TTL_DAYS.search + 1) * 24 * 60 * 60 * 1000;
  assert.equal(cache.get('search', 'Fort Kochi fee'), undefined);
  assert.throws(() => cache.get('bogus', 'k'), /Unknown cache kind/);
});
