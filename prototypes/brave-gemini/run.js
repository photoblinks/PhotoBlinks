// Isolated 5-location prototype: Brave Search + Gemini 3.1 Flash-Lite.
// No database, no Gemini search grounding, no approvals. Output is a local JSON report.
//
//   node prototypes/brave-gemini/run.js            # DRY RUN (default): simulated network, no keys, no cost
//   node prototypes/brave-gemini/run.js --live     # REAL Brave + Gemini calls (needs BRAVE_API_KEY, GEMINI_API_KEY)
//
// Run from the repo root. Strict total budget: ₹10 (reserved before every paid call).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cfg = require('./config');
const { LOCATIONS } = require('./locations');
const { getPricing } = require('../../gemini-pricing');
const { createTracker } = require('./cost');
const { createCache } = require('./cache');
const { createSearcher } = require('./brave');
const { createPageGetter } = require('./page-fetch');
const { callGemini } = require('./gemini-lite');
const { processLocation } = require('./pipeline');

const LIVE = process.argv.includes('--live');
const REPORT_DIR = path.join(__dirname, 'reports');

function buildRuntime() {
  if (!LIVE) {
    const { createDryRunNetwork } = require('./dry-run-fixtures');
    const net = createDryRunNetwork();
    // Fresh temp cache so a dry run never reads or pollutes the real local cache.
    const cache = createCache(fs.mkdtempSync(path.join(os.tmpdir(), 'brave-gemini-dry-')));
    return { net, cache, braveKey: 'dry-run', geminiKey: 'dry-run' };
  }
  require('dotenv').config({ path: '.env.local' });
  const braveKey = process.env.BRAVE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!braveKey || !geminiKey) throw new Error('--live needs BRAVE_API_KEY and GEMINI_API_KEY in .env.local');
  // --fresh-cache: a brand-new empty cache directory, so no earlier search, page or model answer
  // can be reused (every search and model call is real and counted).
  const cacheDir = process.argv.includes('--fresh-cache')
    ? fs.mkdtempSync(path.join(__dirname, '.cache-fresh-'))
    : path.join(__dirname, '.cache');
  return { net: { fetchImpl: fetch, transport: undefined, lookup: undefined, log: null }, // transport/lookup undefined = pinned https transport + real DNS
    cache: createCache(cacheDir), cacheDir, braveKey, geminiKey };
}

async function main() {
  const pricing = getPricing(cfg.MODEL);
  const tracker = createTracker({ limitInr: cfg.TEST_BUDGET_INR, pricing });
  const { net, cache, cacheDir, braveKey, geminiKey } = buildRuntime();
  const getPage = createPageGetter({ cache, transport: net.transport, lookup: net.lookup });
  const callLlm = prompt => callGemini(prompt, { apiKey: geminiKey, fetchImpl: net.fetchImpl });

  console.log(`${LIVE ? 'LIVE' : 'DRY RUN'}: ${LOCATIONS.length} locations, model ${cfg.MODEL}, budget ₹${cfg.TEST_BUDGET_INR}, max ${cfg.MAX_SEARCHES_PER_LOCATION} searches/location.`);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: LIVE ? 'live' : 'dry-run',
    model: cfg.MODEL,
    dbAccess: false,
    approvals: false,
    geminiSearchGrounding: false,
    budgetInr: cfg.TEST_BUDGET_INR,
    perLocationCeilingInr: cfg.PER_LOCATION_CEILING_INR,
    maxSearchesPerLocation: cfg.MAX_SEARCHES_PER_LOCATION,
    cacheDir: cacheDir ?? '(temporary dry-run cache)',
    freshCache: process.argv.includes('--fresh-cache'),
    pricing,
    braveUsdPerSearch: cfg.BRAVE_USD_PER_SEARCH,
    costNote: 'Brave at $5/1,000 (third-party summary, monthly credit ignored); Gemini at official prices from returned usage. Verify against both billing consoles.',
    locations: [],
    totals: null,
  };

  for (const location of LOCATIONS) {
    console.log(`\n=== ${location.name} ===`);
    const searcher = createSearcher({ apiKey: braveKey, fetchImpl: net.fetchImpl, cache, tracker });
    tracker.beginLocation(cfg.PER_LOCATION_CEILING_INR);
    const record = await processLocation(location, { searcher, getPage, callLlm, tracker, cache });
    tracker.endLocation();
    const verified = Object.entries(record.fields).filter(([, v]) => v.verified).map(([k]) => k);
    console.log(`  searches: ${record.searchStats.networkSearches} network + ${record.searchStats.cacheHits} cached (cap ${cfg.MAX_SEARCHES_PER_LOCATION})`);
    for (const r of record.searchResults) console.log(`    ${r.kept ? 'KEPT   ' : `DROPPED(${r.dropReason})`} ${r.url}`);
    for (const p of record.pages) console.log(`    page ${p.ok ? `ok ${p.chars} chars` : `rejected: ${p.reason}`} ${p.url}`);
    console.log(`  verified (${verified.length}/6): ${verified.join(', ') || 'none'}`);
    console.log(`  pending proposals (manual review required): ${record.proposals.length}; fields kept as they are: ${record.preserved.length}`);
    for (const [k, v] of Object.entries(record.fields)) if (!v.verified) console.log(`    - ${k}: ${v.reason}`);
    console.log(`  confidence ${record.confidence}; cost ₹${record.costInr.toFixed(4)}; running total ₹${tracker.spentInr.toFixed(4)} / ₹${cfg.TEST_BUDGET_INR}`);
    report.locations.push(record);
    // Stop immediately on any budget limit, or on an auth/quota failure (it would only burn more paid attempts).
    const authOrQuota = record.errors.find(e => [401, 403, 429].includes(e.status));
    if (record.stoppedBy === 'budget' || authOrQuota) {
      report.stoppedEarly = { at: location.name, reason: record.stoppedBy === 'budget' ? record.stoppedDetail : `HTTP ${authOrQuota.status} from ${authOrQuota.stage}`, notRun: LOCATIONS.slice(LOCATIONS.indexOf(location) + 1).map(l => l.name) };
      console.log(`
  STOPPED: ${report.stoppedEarly.reason}`);
      break;
    }
  }

  report.totals = {
    spentInr: tracker.spentInr,
    ...tracker.totals,
    perLocationInr: tracker.spentInr / LOCATIONS.length,
    pendingProposals: report.locations.reduce((n, r) => n + (r.proposals?.length || 0), 0),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${report.mode}-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nTotals: ₹${tracker.spentInr.toFixed(4)} of ₹${cfg.TEST_BUDGET_INR}; ${tracker.totals.braveSearches} Brave searches, ${tracker.totals.llmCalls} Gemini calls, ${tracker.totals.inputTokens}/${tracker.totals.outputTokens} tokens, ${tracker.totals.cacheHits} cache hits.`);
  console.log(`Report: ${file}`);
}

main().catch(e => { console.error(e); process.exit(1); });
