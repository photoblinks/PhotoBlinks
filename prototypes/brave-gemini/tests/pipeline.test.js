const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSearcher, SearchLimitError } = require('../brave');
const { createTracker, BudgetError } = require('../cost');
const { createCache } = require('../cache');
const { createPageGetter } = require('../page-fetch');
const { callGemini } = require('../gemini-lite');
const { processLocation } = require('../pipeline');
const { createDryRunNetwork } = require('../dry-run-fixtures');
const { LOCATIONS } = require('../locations');
const { getPricing } = require('../../../gemini-pricing');
const cfg = require('../config');

const tmpCache = () => createCache(fs.mkdtempSync(path.join(os.tmpdir(), 'bg-pipe-test-')));
const newTracker = limitInr => createTracker({ limitInr, pricing: getPricing(cfg.MODEL) });

function braveFetch(counter, results = [{ title: 't', url: 'https://asi.nic.in/a', description: 'd' }]) {
  return async () => {
    counter.n++;
    return new Response(JSON.stringify({ web: { results } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('searcher: a third search() call throws SearchLimitError and never reaches the network', async () => {
  const counter = { n: 0 };
  const s = createSearcher({ apiKey: 'k', fetchImpl: braveFetch(counter), cache: tmpCache(), tracker: newTracker(10) });
  await s.search('q1');
  await s.search('q2');
  await assert.rejects(s.search('q3'), SearchLimitError);
  assert.equal(counter.n, 2);
  assert.equal(s.stats.networkSearches, 2);
});

test('searcher: cache hits cost nothing but still count toward the per-location cap', async () => {
  const cache = tmpCache();
  const counter = { n: 0 };
  const tracker = newTracker(10);
  const first = createSearcher({ apiKey: 'k', fetchImpl: braveFetch(counter), cache, tracker });
  await first.search('same query');
  const spentAfterFirst = tracker.spentInr;
  const second = createSearcher({ apiKey: 'k', fetchImpl: braveFetch(counter), cache, tracker });
  const hit = await second.search('Same   Query');
  assert.equal(hit.cached, true);
  assert.equal(counter.n, 1);
  assert.equal(tracker.spentInr, spentAfterFirst);
  await second.search('another');
  await assert.rejects(second.search('third'), SearchLimitError); // hit + miss = 2 calls = cap
});

test('searcher: maxSearches can only lower the cap, never raise it', async () => {
  const s = createSearcher({ apiKey: 'k', fetchImpl: braveFetch({ n: 0 }), cache: tmpCache(), tracker: newTracker(10), maxSearches: 99 });
  await s.search('a');
  await s.search('b');
  await assert.rejects(s.search('c'), SearchLimitError);
  const one = createSearcher({ apiKey: 'k', fetchImpl: braveFetch({ n: 0 }), cache: tmpCache(), tracker: newTracker(10), maxSearches: 1 });
  await one.search('a');
  await assert.rejects(one.search('b'), SearchLimitError);
});

test('searcher: budget refusal happens before any network call; failed searches are still charged and not retried', async () => {
  const counter = { n: 0 };
  const broke = newTracker(0.1); // one Brave search costs more than ₹0.1
  const s = createSearcher({ apiKey: 'k', fetchImpl: braveFetch(counter), cache: tmpCache(), tracker: broke });
  await assert.rejects(s.search('q'), BudgetError);
  assert.equal(counter.n, 0);

  const tracker = newTracker(10);
  let calls = 0;
  const failing = async () => { calls++; return new Response('{}', { status: 429 }); };
  const s2 = createSearcher({ apiKey: 'k', fetchImpl: failing, cache: tmpCache(), tracker });
  await assert.rejects(s2.search('q'), /HTTP 429/);
  assert.equal(calls, 1); // no retry
  assert.ok(Math.abs(tracker.spentInr - tracker.braveCostInr) < 1e-9);
});

test('Gemini request has no tools / grounding and uses the header key, not the URL', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: {} }), { status: 200 });
  };
  await callGemini('prompt', { apiKey: 'SECRET', fetchImpl });
  assert.equal('tools' in seen.body, false);
  assert.doesNotMatch(JSON.stringify(seen.body), /google_?search/i);
  assert.match(seen.url, /gemini-3\.1-flash-lite:generateContent$/);
  assert.doesNotMatch(seen.url, /SECRET/);
  assert.equal(seen.init.headers['x-goog-api-key'], 'SECRET');
  assert.equal(seen.body.generationConfig.maxOutputTokens, cfg.MAX_OUTPUT_TOKENS);
});

async function runDry(extra = {}) {
  const net = createDryRunNetwork();
  const cache = tmpCache();
  const tracker = newTracker(cfg.TEST_BUDGET_INR);
  const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
  const callLlm = prompt => callGemini(prompt, { apiKey: 'dry', fetchImpl: net.fetchImpl });
  const records = [];
  for (const location of LOCATIONS) {
    const searcher = createSearcher({ apiKey: 'dry', fetchImpl: net.fetchImpl, cache, tracker });
    records.push(await processLocation(location, { searcher, getPage, callLlm, tracker, cache, ...extra }));
  }
  return { records, net, tracker, cache };
}

test('dry run: scenarios behave as designed across the 5 locations', async () => {
  const { records, net, tracker } = await runDry();
  const byName = Object.fromEntries(records.map(r => [r.location.name, r]));

  assert.equal(byName['Bangalore Palace Grounds'].verifiedFieldCount, 6);
  assert.equal(byName['Munnar Tea Gardens'].verifiedFieldCount, 6);
  assert.equal(byName['Coorg Coffee Plantation'].fields.shoot_permit_fee.reason, 'quote_not_in_page'); // hallucinated quote
  assert.equal(byName['Fort Kochi'].fields.entry_fee.reason, 'amount_not_in_quote');                    // amount mismatch
  const none = byName['Hampi Heritage Site'];
  assert.equal(none.verifiedFieldCount, 0);                                                              // no usable sources
  assert.equal(none.llm, null);                                                                          // and no model call spent

  for (const r of records) {
    assert.ok(r.searchStats.calls <= cfg.MAX_SEARCHES_PER_LOCATION);
    assert.ok(r.searchStats.networkSearches <= cfg.MAX_SEARCHES_PER_LOCATION);
  }
  assert.equal(net.log.braveCalls.length, 10);
  assert.equal(tracker.totals.llmCalls, 4);
  assert.ok(tracker.spentInr < cfg.TEST_BUDGET_INR);
  assert.equal(tracker.reservedInr, 0);
  for (const body of net.log.geminiBodies) assert.equal('tools' in body, false);
  // blogs and images from search results were never fetched
  assert.ok(net.log.pageCalls.every(u => !/weddingblog|travelblog|\.jpg|\.png/.test(u)));
});

test('dry run: a second run on the same cache makes no paid calls', async () => {
  const first = await runDry();
  const net2 = createDryRunNetwork();
  const tracker = newTracker(cfg.TEST_BUDGET_INR);
  const getPage = createPageGetter({ cache: first.cache, transport: net2.transport, lookup: net2.lookup });
  const callLlm = prompt => callGemini(prompt, { apiKey: 'dry', fetchImpl: net2.fetchImpl });
  for (const location of LOCATIONS) {
    const searcher = createSearcher({ apiKey: 'dry', fetchImpl: net2.fetchImpl, cache: first.cache, tracker });
    await processLocation(location, { searcher, getPage, callLlm, tracker, cache: first.cache });
  }
  assert.equal(net2.log.braveCalls.length, 0);
  assert.equal(net2.log.geminiBodies.length, 0);
  assert.equal(net2.log.pageCalls.length, 0);
  assert.equal(tracker.spentInr, 0);
});

test('strict budget: a tiny budget stops paid calls and never overspends', async () => {
  const net = createDryRunNetwork();
  const cache = tmpCache();
  const tracker = newTracker(1); // fits 2 Brave searches (₹0.83) but not the model call on top
  const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
  const callLlm = prompt => callGemini(prompt, { apiKey: 'dry', fetchImpl: net.fetchImpl });
  const searcher = createSearcher({ apiKey: 'dry', fetchImpl: net.fetchImpl, cache, tracker });
  const r = await processLocation(LOCATIONS[0], { searcher, getPage, callLlm, tracker, cache });
  assert.ok(tracker.spentInr <= 1);
  assert.equal(r.stoppedBy, 'budget');
  assert.equal(r.verifiedFieldCount, 0);
  assert.equal(net.log.geminiBodies.length, 0);
});

test('LLM failure handling: HTTP errors are not billed; timeouts are billed at the reservation; no retry', async () => {
  const net = createDryRunNetwork();
  for (const [error, billed] of [[Object.assign(new Error('bad'), { status: 400 }), false], [new Error('timeout'), true]]) {
    const tracker = newTracker(cfg.TEST_BUDGET_INR);
    const cache = tmpCache();
    let calls = 0;
    const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
    const searcher = createSearcher({ apiKey: 'dry', fetchImpl: net.fetchImpl, cache, tracker });
    const before = tracker.braveCostInr * 2;
    const r = await processLocation(LOCATIONS[0], { searcher, getPage, callLlm: async () => { calls++; throw error; }, tracker, cache });
    assert.equal(calls, 1);
    assert.equal(r.verifiedFieldCount, 0);
    assert.equal(tracker.spentInr > before + 1e-9, billed);
    assert.equal(tracker.reservedInr, 0);
  }
});

test('unparseable model output: fields stay unverified and the failure is recorded', async () => {
  const net = createDryRunNetwork();
  const cache = tmpCache();
  const tracker = newTracker(cfg.TEST_BUDGET_INR);
  const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
  const searcher = createSearcher({ apiKey: 'dry', fetchImpl: net.fetchImpl, cache, tracker });
  const r = await processLocation(LOCATIONS[0], { searcher, getPage, callLlm: async () => ({ text: 'not json', usage: { inputTokens: 100, outputTokens: 10 } }), tracker, cache });
  assert.equal(r.verifiedFieldCount, 0);
  assert.ok(r.errors.some(e => e.stage === 'parse'));
});

test('per-location ceiling: reservations must fit the location limit as well as the total budget', async () => {
  const tracker = newTracker(cfg.TEST_BUDGET_INR);
  const b = tracker.braveCostInr;
  tracker.beginLocation(b * 1.5); // room for one Brave search, not two
  const r1 = tracker.reserve('brave', b);
  tracker.settle(r1, b);
  assert.ok(Math.abs(tracker.locationSpentInr - b) < 1e-9);
  assert.throws(() => tracker.reserve('brave', b), /Per-location ceiling/);
  tracker.endLocation();
  tracker.beginLocation(cfg.PER_LOCATION_CEILING_INR); // a new location starts from zero
  assert.equal(tracker.locationSpentInr, 0);
  tracker.reserve('brave', b);
});

test('per-location ceiling stops a location after one search and records why', async () => {
  const net = createDryRunNetwork();
  const cache = tmpCache();
  const tracker = newTracker(cfg.TEST_BUDGET_INR);
  tracker.beginLocation(tracker.braveCostInr * 1.5);
  const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
  const searcher = createSearcher({ apiKey: 'dry', fetchImpl: net.fetchImpl, cache, tracker });
  const r = await processLocation(LOCATIONS[0], { searcher, getPage, callLlm: async () => { throw new Error('must not be called'); }, tracker, cache });
  assert.equal(r.stoppedBy, 'budget');
  assert.match(r.stoppedDetail, /Per-location ceiling/);
  assert.equal(net.log.braveCalls.length, 1);
  assert.equal(r.searchStats.networkSearches, 1);
});

test('worst case for every fixed location fits the ₹2 ceiling, and 5 of them fit the ₹10 budget', () => {
  const tracker = newTracker(cfg.TEST_BUDGET_INR);
  const maxPromptChars = cfg.MAX_PAGES_PER_LOCATION * cfg.EXCERPT_CHARS_PER_PAGE + 3000;
  const worst = cfg.MAX_SEARCHES_PER_LOCATION * tracker.braveCostInr + tracker.estimateLlmCostInr(maxPromptChars);
  assert.ok(worst <= cfg.PER_LOCATION_CEILING_INR, `₹${worst.toFixed(3)}`);
  assert.ok(worst * LOCATIONS.length <= cfg.TEST_BUDGET_INR, `₹${(worst * LOCATIONS.length).toFixed(3)}`);
});
