// Controlled Gemini verification test: exactly 5 fixed locations, NO database access
// (no pg client, no Supabase, no DATABASE_URL read), nothing is approved or stored.
// Calls the Gemini API only, and writes a local JSON report for manual review.
//
//   node scripts/gemini-controlled-test.js --dry-run   # list locations + worst-case cost, no API calls
//   node scripts/gemini-controlled-test.js             # run the 5 locations
//
// Env: GEMINI_API_KEY (from .env.local). Optional AI_TEST_COST_LIMIT_INR (default 30):
// ACTUAL usage (returned tokens + search queries, official pricing in gemini-pricing.js)
// is metered; no further API call starts once the running total reaches the limit.
// Run from the repo root (gemini-client.js loads .env.local relative to cwd).
const fs = require('node:fs');
const path = require('node:path');
const { verifyLocation, estimateWorstCaseCostPerLocation, MODEL_NAME } = require('../gemini-client');
const { getPricing, createBudget } = require('../gemini-pricing');

const LOCATIONS = [
  { name: 'Bangalore Palace Grounds', city_name: 'Bengaluru', state_name: 'Karnataka', category: 'Palace' },
  { name: 'Coorg Coffee Plantation', city_name: 'Madikeri', state_name: 'Karnataka', category: 'Plantation' },
  { name: 'Fort Kochi', city_name: 'Kochi', state_name: 'Kerala', category: 'Beach' },
  { name: 'Hampi Heritage Site', city_name: 'Hampi', state_name: 'Karnataka', category: 'Heritage' },
  { name: 'Munnar Tea Gardens', city_name: 'Munnar', state_name: 'Kerala', category: 'Hill' },
];

const COST_LIMIT_INR = Number(process.env.AI_TEST_COST_LIMIT_INR) || 30;
const DRY_RUN = process.argv.includes('--dry-run');
const REPORT_PATH = path.resolve(__dirname, '..', 'gemini-controlled-test-report.json');

const VERIFIED_FIELDS = ['pre_wedding_shoot', 'drone_status', 'prior_booking', 'drone_permission', 'entry_fee', 'shoot_permit_fee'];

function logLocation(r) {
  for (const call of r.audit) {
    console.log(`  [${call.call}] queries (${call.groundingQueries.length}): ${JSON.stringify(call.groundingQueries)}`);
    for (const s of call.returnedSources) {
      console.log(`    ${s.kept ? 'KEPT   ' : `DROPPED(${s.dropReason})`} ${s.url}`);
    }
  }
  const verified = VERIFIED_FIELDS.filter(f => r.fieldVerified[f]);
  console.log(`  verified fields (${verified.length}/6): ${verified.join(', ') || 'none'}`);
  console.log(`  confidence: ${r.confidence}`);
  console.log(`  api calls: ${r.apiCalls}${r.followUpRan ? " (fee follow-up ran for " + r.missingFeeFields.join(", ") + ")" : ""}`);
  console.log(`  tokens: in ${r.inputTokens}, out ${r.outputTokens}; est. cost ₹${r.estimatedCostInr.toFixed(4)}`);
}

async function main() {
  const worst = estimateWorstCaseCostPerLocation();
  console.log(`Model ${MODEL_NAME}. ${LOCATIONS.length} locations, no DB access. Worst case ≈ ₹${(worst.totalCostInr * LOCATIONS.length).toFixed(2)} (limit ₹${COST_LIMIT_INR}, metered from actual usage before every API call).`);
  if (DRY_RUN) {
    LOCATIONS.forEach(l => console.log(`  - ${l.name} (${l.city_name}, ${l.state_name})`));
    console.log('Dry run: no API calls made.');
    return;
  }

  const budget = createBudget({ limitInr: COST_LIMIT_INR, pricing: getPricing(MODEL_NAME) });
  const report = {
    generatedAt: new Date().toISOString(),
    model: MODEL_NAME,
    dbWrites: false,
    approvals: false,
    costLimitInr: COST_LIMIT_INR,
    pricing: budget.pricing,
    costNote: 'Computed from returned usageMetadata + search queries at the official prices in gemini-pricing.js (every query billed, free monthly allowance ignored). Verify against Google billing.',
    locations: [],
    totals: { groundingQueries: 0, inputTokens: 0, outputTokens: 0, estimatedCostInr: 0, errors: 0 },
  };
  const save = () => fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  for (const location of LOCATIONS) {
    if (budget.exhausted) {
      console.log(`Cost limit ₹${COST_LIMIT_INR} reached; skipping ${location.name}.`);
      report.locations.push({ location, skipped: 'cost_limit' });
      continue;
    }
    console.log(`\n=== ${location.name} ===`);
    try {
      const result = await verifyLocation(location, { budget });
      logLocation(result);
      report.totals.groundingQueries += result.groundingQueries;
      report.totals.inputTokens += result.inputTokens;
      report.totals.outputTokens += result.outputTokens;
      report.totals.estimatedCostInr = budget.spentInr;
      report.locations.push({ location, result });
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      report.totals.errors++;
      report.locations.push({ location, error: e.message });
    }
    save(); // incremental: partial results survive a crash
  }

  save();
  console.log(`\nTotals: ${report.totals.groundingQueries} queries, ${report.totals.inputTokens} in / ${report.totals.outputTokens} out tokens, est. ₹${report.totals.estimatedCostInr.toFixed(4)}, ${report.totals.errors} errors.`);
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
