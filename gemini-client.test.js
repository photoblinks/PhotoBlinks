// Orchestration tests with a fake API: no network, no database, no real key.
process.env.GEMINI_API_KEY = 'test-key-not-real';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyLocation } = require('./gemini-client');
const { createBudget, getPricing, BudgetExceededError } = require('./gemini-pricing');

const LOC = { name: 'Test Fort', city_name: 'Hampi', state_name: 'Karnataka', category: 'Heritage' };
const noSleep = async () => {};
const noResolve = async () => {}; // never fetch redirect URLs in tests
const OFFICIAL = 'https://asi.nic.in/test-fort';

// Build a Gemini-shaped response. `lines` = [[segmentText, url]] grounded support lines.
function response({ parsed, lines = [], queries = ['q1'], input = 1000, output = 500 }) {
  const chunks = lines.map(([, url], i) => ({ web: { uri: url, title: `src${i}` } }));
  return {
    executionTimeMs: 5,
    data: {
      candidates: [{
        content: { parts: [{ text: JSON.stringify(parsed) }] },
        groundingMetadata: {
          webSearchQueries: queries,
          groundingChunks: chunks,
          groundingSupports: lines.map(([text], i) => ({ segment: { text }, groundingChunkIndices: [i] })),
        },
      }],
      usageMetadata: { promptTokenCount: input, candidatesTokenCount: output },
    },
  };
}

const ALL_PARSED = {
  pre_wedding_shoot: 'conditional', pre_wedding_shoot_condition: 'permit', prior_booking: 'ASI permission',
  drone_status: 'restricted', drone_permission: 'ASI + DGCA', entry_fee: '₹40', shoot_permit_fee: '₹750',
};
const ALL_LINES = [
  ['"pre_wedding_shoot": "conditional"', OFFICIAL],
  ['"prior_booking": "ASI permission"', OFFICIAL],
  ['"drone_status": "restricted"', OFFICIAL],
  ['"drone_permission": "ASI + DGCA"', OFFICIAL],
  ['"entry_fee": "₹40"', OFFICIAL],
  ['"shoot_permit_fee": "₹750"', OFFICIAL],
];
const NON_FEE_LINES = ALL_LINES.filter(([t]) => !/fee/.test(t));
const FEES_UNKNOWN = { ...ALL_PARSED, entry_fee: 'unknown', shoot_permit_fee: 'unknown' };

function fakeApi(responses) {
  const prompts = [];
  const fn = async prompt => {
    prompts.push(prompt);
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra API call');
    if (next instanceof Error) throw next;
    return next;
  };
  fn.prompts = prompts;
  return fn;
}

test('everything verified in the first call: exactly 1 API call, no follow-up', async () => {
  const api = fakeApi([response({ parsed: ALL_PARSED, lines: ALL_LINES, queries: ['a', 'b', 'c', 'd'] })]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  assert.equal(api.prompts.length, 1);
  assert.equal(r.apiCalls, 1);
  assert.equal(r.followUpRan, false);
  assert.equal(r.groundedFieldCount, 6);
  assert.equal(r.entry_fee, '₹40');
  assert.equal(r.groundingQueries, 4);
});

test('both fees unverified: ONE combined follow-up covering both fee fields', async () => {
  const api = fakeApi([
    response({ parsed: FEES_UNKNOWN, lines: NON_FEE_LINES }),
    response({
      parsed: { entry_fee: '₹40', shoot_permit_fee: '₹750' },
      lines: [['"entry_fee": "₹40"', OFFICIAL], ['"shoot_permit_fee": "₹750"', OFFICIAL]],
      queries: ['x', 'y'],
    }),
  ]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  assert.equal(api.prompts.length, 2);
  assert.deepEqual(r.missingFeeFields, ['entry_fee', 'shoot_permit_fee']);
  assert.match(api.prompts[1], /"entry_fee"/);
  assert.match(api.prompts[1], /"shoot_permit_fee"/);
  assert.equal(r.fieldVerified.entry_fee, true);
  assert.equal(r.fieldVerified.shoot_permit_fee, true);
  assert.equal(r.groundedFieldCount, 6);
  assert.equal(r.groundingQueries, 1 + 2);
});

test('one fee missing: follow-up asks for that fee only; verified fee is not re-searched or overwritten', async () => {
  const api = fakeApi([
    response({
      parsed: { ...ALL_PARSED, shoot_permit_fee: 'unknown' },
      lines: ALL_LINES.filter(([t]) => !/shoot_permit_fee/.test(t)),
    }),
    // follow-up wrongly returns a different entry_fee, which must be ignored.
    response({ parsed: { shoot_permit_fee: '₹750', entry_fee: '₹9999' }, lines: [['"shoot_permit_fee": "₹750"', OFFICIAL]] }),
  ]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  assert.deepEqual(r.missingFeeFields, ['shoot_permit_fee']);
  assert.doesNotMatch(api.prompts[1], /"entry_fee"/);
  assert.equal(r.entry_fee, '₹40');
  assert.equal(r.shoot_permit_fee, '₹750');
});

test('field-level independence: unverified fields stay unverified; fee evidence does not leak between fees', async () => {
  const api = fakeApi([
    response({ parsed: ALL_PARSED, lines: [['"entry_fee": "₹40"', OFFICIAL]] }),
    response({ parsed: { shoot_permit_fee: 'unknown' }, lines: [] }),
  ]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  assert.equal(r.fieldVerified.entry_fee, true);
  assert.equal(r.fieldVerified.shoot_permit_fee, false);
  assert.equal(r.fieldVerified.drone_status, false);
  assert.equal(r.shoot_permit_fee, 'unknown');
  assert.equal(r.drone_status, 'unverified');
  assert.equal(r.groundedFieldCount, 1);
});

test('0 searches is billed and NOT retried', async () => {
  const api = fakeApi([
    response({ parsed: ALL_PARSED, lines: [], queries: [] }),
    response({ parsed: {}, lines: [], queries: [] }),
  ]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  // main (no retry) + one fee follow-up; never more.
  assert.equal(api.prompts.length, 2);
  assert.equal(r.groundedFieldCount, 0);
  assert.equal(r.confidence, 0);
});

test('transient API error is retried (up to 2) then succeeds; non-transient is not retried', async () => {
  const transient = Object.assign(new Error('rate limited'), { status: 429 });
  const api = fakeApi([transient, transient, response({ parsed: ALL_PARSED, lines: ALL_LINES })]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  assert.equal(api.prompts.length, 3);
  assert.equal(r.groundedFieldCount, 6);

  const bad = Object.assign(new Error('bad request'), { status: 400 });
  const api2 = fakeApi([bad, response({ parsed: ALL_PARSED, lines: ALL_LINES })]);
  await assert.rejects(verifyLocation(LOC, { callApi: api2, sleep: noSleep, resolveRedirects: noResolve }), /bad request/);
  assert.equal(api2.prompts.length, 1);
});

test('transient errors beyond the retry limit throw', async () => {
  const transient = Object.assign(new Error('unavailable'), { status: 503 });
  const api = fakeApi([transient, transient, transient]);
  await assert.rejects(verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve }), /unavailable/);
  assert.equal(api.prompts.length, 3);
});

test('a failed follow-up keeps the main result and records the error', async () => {
  const api = fakeApi([
    response({ parsed: FEES_UNKNOWN, lines: NON_FEE_LINES }),
    Object.assign(new Error('bad request'), { status: 400 }),
  ]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  assert.equal(r.groundedFieldCount, 4);
  assert.match(r.followUpError, /bad request/);
});

test('cost is metered from returned usage and queries at official pricing, and recorded in the budget', async () => {
  const pricing = getPricing('gemini-3.8-flash', new Date('2026-11-20T00:00:00Z'));
  const budget = createBudget({ limitInr: 1000, pricing });
  const api = fakeApi([response({ parsed: ALL_PARSED, lines: ALL_LINES, queries: ['a', 'b', 'c'], input: 2_000_000, output: 1_000_000 })]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve, budget });
  const expectedUsd = 2 * 0.75 + 1 * 3.75 + 3 * 0.014;
  assert.ok(Math.abs(r.estimatedCostUsd - expectedUsd) < 1e-9);
  assert.ok(Math.abs(budget.spentInr - expectedUsd * pricing.usdToInr) < 1e-6);
  assert.deepEqual(budget.totals, { inputTokens: 2_000_000, outputTokens: 1_000_000, queries: 3 });
});

test('exhausted budget: no API call starts', async () => {
  const budget = createBudget({ limitInr: 1, pricing: getPricing('gemini-3.8-flash') });
  budget.record({ inputTokens: 10_000_000, outputTokens: 0, queries: 0 });
  const api = fakeApi([]);
  await assert.rejects(verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve, budget }), BudgetExceededError);
  assert.equal(api.prompts.length, 0);
});

test('budget exhausted by the main call: follow-up is skipped, main result kept', async () => {
  const budget = createBudget({ limitInr: 0.0001, pricing: getPricing('gemini-3.8-flash') });
  const api = fakeApi([response({ parsed: FEES_UNKNOWN, lines: NON_FEE_LINES })]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve, budget });
  assert.equal(api.prompts.length, 1);
  assert.equal(r.budgetStopped, true);
  assert.equal(r.followUpRan, false);
  assert.equal(r.groundedFieldCount, 4);
});

test('unusable sources (blog/image/redirect) never verify a field and are dropped from stored sources', async () => {
  const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz';
  const lines = [
    ['"entry_fee": "₹40"', 'https://travelblog.example.com/post'],
    ['"shoot_permit_fee": "₹750"', 'https://asi.nic.in/fees.png'],
    ['"drone_status": "restricted"', REDIRECT],
  ];
  const api = fakeApi([
    response({ parsed: ALL_PARSED, lines }),
    response({ parsed: { entry_fee: 'unknown', shoot_permit_fee: 'unknown' }, lines: [] }),
  ]);
  const r = await verifyLocation(LOC, { callApi: api, sleep: noSleep, resolveRedirects: noResolve });
  assert.equal(r.groundedFieldCount, 0);
  assert.equal(r.sources.length, 0);
  assert.ok(r.sourcesFiltered >= 3);
});
