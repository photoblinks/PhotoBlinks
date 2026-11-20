// Durable-ledger hooks and the hard-deadline plumbing of the pipeline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTracker, BudgetError } = require('../cost');
const { createSearcher, braveSearch } = require('../brave');
const { callGemini } = require('../gemini-lite');
const { fetchPage, createPageGetter } = require('../page-fetch');
const { createCache } = require('../cache');
const { processLocation } = require('../pipeline');
const { createDryRunNetwork } = require('../dry-run-fixtures');
const { LOCATIONS } = require('../locations');
const { getPricing } = require('../../../gemini-pricing');
const cfg = require('../config');

const pricing = getPricing(cfg.MODEL);
const tmpCache = () => createCache(fs.mkdtempSync(path.join(os.tmpdir(), 'bg-ledger-test-')));

function recordingLedger({ refuse = false, failConfirm = false } = {}) {
  const events = [];
  return {
    events,
    reserve: async (kind, amount) => {
      events.push(['reserve', kind, amount]);
      if (refuse) throw new Error('cap would be exceeded');
      return `res-${events.length}`;
    },
    confirm: async (id, actual, usage) => {
      events.push(['confirm', id, actual, usage]);
      if (failConfirm) throw new Error('network');
    },
  };
}

test('tracker.reserveAsync / settleAsync without a ledger behave exactly like reserve / settle', async () => {
  const t = createTracker({ limitInr: 10, pricing });
  const r = await t.reserveAsync('brave', 1);
  assert.equal(t.reservedInr, 1);
  await t.settleAsync(r, 0.4);
  assert.equal(t.reservedInr, 0);
  assert.equal(t.spentInr, 0.4);
  t.beginLocation(0.5);
  await assert.rejects(t.reserveAsync('brave', 0.6), BudgetError);
});

test('with a ledger: reserve BEFORE the call, confirm AFTER it, with the real cost and usage', async () => {
  const ledger = recordingLedger();
  const t = createTracker({ limitInr: 10, pricing, ledger });
  const r = await t.reserveAsync('gemini', 0.85);
  assert.deepEqual(ledger.events, [['reserve', 'gemini', 0.85]]);
  await t.settleAsync(r, 0.07, { inputTokens: 100, outputTokens: 20 });
  assert.deepEqual(ledger.events[1], ['confirm', 'res-1', 0.07, { inputTokens: 100, outputTokens: 20 }]);
  assert.equal(t.spentInr, 0.07);
});

test('a ledger that refuses the reservation stops the call: BudgetError, nothing stays reserved locally', async () => {
  const t = createTracker({ limitInr: 10, pricing, ledger: recordingLedger({ refuse: true }) });
  await assert.rejects(t.reserveAsync('brave', 0.4), err => err instanceof BudgetError && /ledger refused/.test(err.message));
  assert.equal(t.reservedInr, 0);
  assert.equal(t.spentInr, 0);
});

test('a lost confirmation never throws and is not retried: the reservation stays charged in full by the ledger', async () => {
  const ledger = recordingLedger({ failConfirm: true });
  const t = createTracker({ limitInr: 10, pricing, ledger });
  const r = await t.reserveAsync('brave', 0.4);
  await t.settleAsync(r, 0.4);
  assert.equal(ledger.events.filter(e => e[0] === 'confirm').length, 1);
  assert.equal(t.reservedInr, 0);
});

test('searcher: the durable reservation is made before the network call and confirmed after, even when the call fails', async () => {
  const ledger = recordingLedger();
  const tracker = createTracker({ limitInr: 10, pricing, ledger });
  const order = [];
  const fetchImpl = async () => { order.push('fetch'); return new Response('{}', { status: 429 }); };
  ledger.events.push = (function (orig) { return function (e) { order.push(e[0]); return orig.call(this, e); }; })(ledger.events.push);
  const s = createSearcher({ apiKey: 'k', fetchImpl, cache: tmpCache(), tracker });
  await assert.rejects(s.search('q'), /HTTP 429/);
  assert.deepEqual(order, ['reserve', 'fetch', 'confirm']);
  const confirm = ledger.events.find(e => e[0] === 'confirm');
  assert.equal(confirm[2], tracker.braveCostInr); // a failed call is assumed billed
});

test('searcher: a refused reservation means NO network call', async () => {
  const tracker = createTracker({ limitInr: 10, pricing, ledger: recordingLedger({ refuse: true }) });
  let calls = 0;
  const s = createSearcher({ apiKey: 'k', fetchImpl: async () => { calls++; return new Response('{}'); }, cache: tmpCache(), tracker });
  await assert.rejects(s.search('q'), BudgetError);
  assert.equal(calls, 0);
});

test('abort: an aborted search request is still confirmed (assumed billed) and the error propagates', async () => {
  const ledger = recordingLedger();
  const tracker = createTracker({ limitInr: 10, pricing, ledger });
  const ctrl = new AbortController();
  const fetchImpl = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const s = createSearcher({ apiKey: 'k', fetchImpl, cache: tmpCache(), tracker, signal: ctrl.signal });
  const pending = s.search('q');
  setTimeout(() => ctrl.abort(), 20);
  await assert.rejects(pending, /aborted/);
  assert.deepEqual(ledger.events.map(e => e[0]), ['reserve', 'confirm']);
  assert.equal(tracker.reservedInr, 0);
});

test('the outer signal reaches every kind of request (Brave, Gemini, page fetch)', async () => {
  const seen = {};
  const watch = name => (url, init) => new Promise((_, reject) => {
    seen[name] = init.signal;
    init.signal.addEventListener('abort', () => reject(new Error(`${name} aborted`)));
  });
  const ctrl = new AbortController();
  const a = braveSearch('q', { apiKey: 'k', fetchImpl: watch('brave'), signal: ctrl.signal });
  const g = callGemini('p', { apiKey: 'k', fetchImpl: watch('gemini'), signal: ctrl.signal });
  let pageSignal;
  const transport = req => new Promise((_, reject) => { pageSignal = req.signal; req.signal.addEventListener('abort', () => reject(new Error('page aborted'))); });
  const p = fetchPage('https://asi.nic.in/a', { transport, lookup: async () => [{ address: '93.184.216.34', family: 4 }], signal: ctrl.signal });
  await new Promise(r => setTimeout(r, 20));
  ctrl.abort();
  await assert.rejects(a, /brave aborted/);
  await assert.rejects(g, /gemini aborted/);
  const page = await p;
  assert.equal(page.ok, false);
  assert.equal(page.reason, 'fetch_error');
  assert.equal(seen.brave.aborted, true);
  assert.equal(seen.gemini.aborted, true);
  assert.equal(pageSignal.aborted, true);
});

test('page getter forwards the signal; without one nothing changes', async () => {
  const ctrl = new AbortController();
  let got;
  const transport = async req => { got = req.signal; return { status: 404, headers: { get: () => 'text/html' }, body: (async function* () {})() }; };
  const getPage = createPageGetter({ cache: tmpCache(), transport, lookup: async () => [{ address: '93.184.216.34', family: 4 }], signal: ctrl.signal });
  await getPage('https://asi.nic.in/a');
  ctrl.abort();
  assert.equal(got.aborted, true);
});

// ---------------------------------------------------------------- pipeline deadline (soft stops)

function harness(deadline, overrides = {}) {
  const net = createDryRunNetwork();
  const cache = tmpCache();
  const tracker = createTracker({ limitInr: Infinity, pricing });
  tracker.beginLocation(2);
  const searcher = createSearcher({ apiKey: 'k', fetchImpl: net.fetchImpl, cache, tracker });
  const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
  let llmCalls = 0;
  const callLlm = overrides.callLlm || (async prompt => { llmCalls++; return callGemini(prompt, { apiKey: 'k', fetchImpl: net.fetchImpl }); });
  return { net, tracker, run: () => processLocation(LOCATIONS[0], { searcher, getPage, callLlm, tracker, cache, deadline }), llmCalls: () => llmCalls };
}

test('deadline already passed: nothing paid is started', async () => {
  const h = harness({ signal: new AbortController().signal, timeLeftMs: () => 0 });
  const r = await h.run();
  assert.equal(r.stoppedBy, 'deadline');
  assert.equal(h.net.log.braveCalls.length, 0);
  assert.equal(h.tracker.spentInr, 0);
  assert.equal(r.proposals.length, 0);
});

test('not enough time left for the model call: it is NOT started (it would be aborted and billed for nothing)', async () => {
  let left = 40_000;
  const h = harness({ signal: new AbortController().signal, timeLeftMs: () => left });
  const origFetch = h.net.fetchImpl;
  h.net.fetchImpl = async (u, i) => { const res = await origFetch(u, i); left = cfg.LLM_MIN_REMAINING_MS - 1; return res; }; // time runs out after the searches
  const net = h.net;
  const cache = tmpCache();
  const tracker = createTracker({ limitInr: Infinity, pricing });
  tracker.beginLocation(2);
  let llm = 0;
  const r = await processLocation(LOCATIONS[0], {
    searcher: createSearcher({ apiKey: 'k', fetchImpl: net.fetchImpl, cache, tracker }),
    getPage: createPageGetter({ cache, transport: net.transport, lookup: net.lookup }),
    callLlm: async () => { llm++; throw new Error('must not be called'); },
    tracker, cache, deadline: { signal: new AbortController().signal, timeLeftMs: () => left },
  });
  assert.equal(llm, 0);
  assert.equal(r.stoppedBy, 'deadline');
  assert.equal(r.proposals.length, 0);
  assert.ok(tracker.spentInr > 0 && tracker.spentInr < 1, 'only the searches were paid');
});

test('plenty of time: the pipeline behaves exactly as before', async () => {
  const h = harness({ signal: new AbortController().signal, timeLeftMs: () => 45_000 });
  const r = await h.run();
  assert.equal(r.stoppedBy, null);
  assert.equal(r.verifiedFieldCount, 6);
});

test('abort during a search is reported as a deadline stop, not a generic failure', async () => {
  const ctrl = new AbortController();
  const net = createDryRunNetwork();
  const cache = tmpCache();
  const tracker = createTracker({ limitInr: Infinity, pricing });
  tracker.beginLocation(2);
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  setTimeout(() => ctrl.abort(), 20); // the deadline fires while the first search is in flight
  const r = await processLocation(LOCATIONS[0], {
    searcher: createSearcher({ apiKey: 'k', fetchImpl: hang, cache, tracker, signal: ctrl.signal }),
    getPage: createPageGetter({ cache, transport: net.transport, lookup: net.lookup }),
    callLlm: async () => { throw new Error('unreachable'); },
    tracker, cache, deadline: { signal: ctrl.signal, timeLeftMs: () => 1000 },
  });
  assert.equal(r.stoppedBy, 'deadline');
});

test('deadline constants: 45 s hard deadline, model call needs 12 s, grace is short', () => {
  assert.equal(cfg.LOCATION_DEADLINE_MS, 45_000);
  assert.equal(cfg.LLM_MIN_REMAINING_MS, 12_000);
  assert.ok(cfg.DEADLINE_GRACE_MS <= 3_000);
  assert.ok(cfg.LOCATION_DEADLINE_MS + cfg.DEADLINE_GRACE_MS < 60_000, 'must fit the 60 s server-action limit with room for the database calls');
});
