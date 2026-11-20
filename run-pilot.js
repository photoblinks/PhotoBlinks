require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const { verifyLocation, estimateWorstCaseCostPerLocation, MODEL_NAME: GEMINI_MODEL } = require('./gemini-client');
const { getPricing, createBudget } = require('./gemini-pricing');

// Explicit target selection. No default, no fallback between databases.
//   node run-pilot.js --mode=validation              (writes only to AI_VALIDATE_URL)
//   node run-pilot.js --mode=production --confirm-production   (writes only to AI_PRODUCTION_URL)
// AI_VERIFY_MODE may be used instead of --mode. Location reads use
// AI_LOCATIONS_READ_URL when set (validation only), otherwise the target DB.
function resolveTarget() {
  const argMode = process.argv.find(a => a.startsWith('--mode='))?.slice('--mode='.length);
  const mode = argMode ?? process.env.AI_VERIFY_MODE;
  if (mode !== 'validation' && mode !== 'production') {
    console.error('Refusing to run: set --mode=validation or --mode=production (or AI_VERIFY_MODE).');
    process.exit(1);
  }
  const envName = mode === 'production' ? 'AI_PRODUCTION_URL' : 'AI_VALIDATE_URL';
  const url = process.env[envName];
  if (!url) {
    console.error(`Refusing to run: ${envName} is not set for ${mode} mode.`);
    process.exit(1);
  }
  if (mode === 'production' && !process.argv.includes('--confirm-production')) {
    console.error('Refusing to run production mode without --confirm-production.');
    process.exit(1);
  }
  const locationsUrl = mode === 'production' ? url : (process.env.AI_LOCATIONS_READ_URL || url);
  const parsed = new URL(url);
  if (mode === 'validation' && !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    console.error('Refusing to run: validation mode only writes to a local database (127.0.0.1/localhost).');
    process.exit(1);
  }
  return { mode, url, locationsUrl, dbName: parsed.pathname.replace(/^\//, ''), host: parsed.host.split('@').pop() };
}

const TARGET = resolveTarget();
const AI_TARGET_URL = TARGET.url;
// Which locations: exactly one (--slug=<slug>) or every published one (--all).
// Optional --limit=<n> caps how many are processed. One of --slug / --all is required.
const ONLY_SLUG = process.argv.find(a => a.startsWith('--slug='))?.slice('--slug='.length);
const RUN_ALL = process.argv.includes('--all');
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.slice('--limit='.length)) || 1000;
if (!ONLY_SLUG && !RUN_ALL) {
  console.error('Refusing to run: pass --slug=<slug> for one location or --all for every published location.');
  process.exit(1);
}
// Spend guards:
//   --dry-run            list what would run + projected cost; no API calls, no writes
//   --force              also re-verify locations checked within the last --min-age-days
//   --min-age-days=<n>   skip locations verified in the last n days (default 30)
//   AI_COST_LIMIT_INR    hard budget for the run; REQUIRED with --all
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const MIN_AGE_DAYS = Number(process.argv.find(a => a.startsWith('--min-age-days='))?.slice('--min-age-days='.length)) || 30;
if (RUN_ALL && !DRY_RUN && !process.env.AI_COST_LIMIT_INR) {
  console.error('Refusing to run --all without an explicit budget: set AI_COST_LIMIT_INR (e.g. 50). Use --dry-run to preview the cost.');
  process.exit(1);
}
if (ONLY_SLUG && RUN_ALL) {
  console.error('Refusing to run: use either --slug or --all, not both.');
  process.exit(1);
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const COST_LIMIT_INR = Number(process.env.AI_COST_LIMIT_INR) || 20;
// Metered from ACTUAL usage (returned tokens + search queries); checked before every API call.
const BUDGET = createBudget({ limitInr: COST_LIMIT_INR, pricing: getPricing(GEMINI_MODEL) });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeInput(str) {
  if (!str) return '';
  return String(str).replace(/[{}]/g, '').trim().slice(0, 200);
}

async function getLocationDetails() {
  const client = new Client({ connectionString: TARGET.locationsUrl });
  await client.connect();
  
  const result = await client.query(`
    SELECT 
      l.id, l.name, l.slug, ci.name as city_name, st.name as state_name, l.category_id,
      c.name as category_name,
      l.pre_wedding_shoot, l.pre_wedding_shoot_condition,
      l.prior_booking, l.drone_status, l.drone_permission,
      l.entry_fee, l.shoot_permit_fee
    FROM locations l
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN cities ci ON l.city_id = ci.id
    LEFT JOIN states st ON l.state_id = st.id
    WHERE l.is_published = true AND ($1::text IS NULL OR l.slug = $1)
    ORDER BY l.name
    LIMIT $2
  `, [ONLY_SLUG ?? null, LIMIT]);
  
  await client.end();
  return result.rows;
}

async function createMaintenanceRun(aiClient) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const leaseToken = require('crypto').randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  
  const result = await aiClient.query(`
    INSERT INTO ai_maintenance_runs (run_date, status, started_at, locked_by, lease_token, lease_expires_at, heartbeat_at, max_attempts)
    VALUES ($1, 'running', now(), 'pilot-worker', $2, $3, now(), 3)
    RETURNING id
  `, [today, leaseToken, leaseExpiresAt]);
  
  return result.rows[0].id;
}

async function updateRunStatus(aiClient, runId, status, stats = {}) {
  await aiClient.query(`
    UPDATE ai_maintenance_runs SET
      status = $2,
      finished_at = CASE WHEN $2 IN ('succeeded', 'failed', 'cancelled') THEN now() ELSE finished_at END,
      processed_locations = COALESCE($3, processed_locations),
      processed_cities = COALESCE($4, processed_cities),
      last_error = COALESCE($5, last_error)
    WHERE id = $1
  `, [runId, status, stats.processedLocations, stats.totalLocations, stats.lastError ?? null]);
}

async function saveVerificationResult(aiClient, runId, locationId, result, currentValues) {
  await aiClient.query(`
    UPDATE ai_location_verification_history 
    SET is_latest = false 
    WHERE location_id = $1 AND run_id != $2 AND is_latest = true
  `, [locationId, runId]);
  
  // When is_latest=true, result must be 'verified_ok' or 'changes_found' per DB constraint
  // 'inconclusive' is only allowed when is_latest=false
  let dbResult;
  if (result.confidence >= 0.7) {
    dbResult = 'verified_ok';
  } else if (result.pre_wedding_shoot === 'unverified' || result.drone_status === 'unverified') {
    dbResult = 'changes_found'; // Use changes_found instead of inconclusive for is_latest=true
  } else {
    dbResult = 'changes_found';
  }
  
  const historyResult = await aiClient.query(`
    INSERT INTO ai_location_verification_history (
      location_id, run_id, result, confidence, summary, source_urls, model,
      input_tokens, output_tokens, grounding_queries, estimated_cost_usd, 
      estimated_cost_inr, execution_time_ms, is_latest
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
    RETURNING id
  `, [
    locationId,
    runId,
    dbResult,
    result.confidence,
    result.summary,
    [...new Set((result.sources || []).filter(s => s.field === 'grounded').map(s => s.url))],
    result.model,
    result.inputTokens,
    result.outputTokens,
    result.groundingQueries || 0,
    result.estimatedCostUsd,
    result.estimatedCostInr,
    result.executionTimeMs
  ]);
  
  const historyId = historyResult.rows[0].id;
  
  // Define the six verification fields
  const verificationFields = [
    { name: 'pre_wedding_shoot', proposed: result.pre_wedding_shoot, verified: result.fieldVerified?.pre_wedding_shoot },
    { name: 'prior_booking', proposed: result.prior_booking, verified: result.fieldVerified?.prior_booking },
    { name: 'drone_status', proposed: result.drone_status, verified: result.fieldVerified?.drone_status },
    { name: 'drone_permission', proposed: result.drone_permission, verified: result.fieldVerified?.drone_permission },
    { name: 'entry_fee', proposed: result.entry_fee, verified: result.fieldVerified?.entry_fee },
    { name: 'shoot_permit_fee', proposed: result.shoot_permit_fee, verified: result.fieldVerified?.shoot_permit_fee },
  ];
  
  // Insert field details for each verification field
  for (const field of verificationFields) {
    const currentValue = currentValues[field.name] ?? null;
    const proposedValue = String(field.proposed ?? 'unknown').trim().slice(0, 500) || 'unknown';
    const isVerified = field.verified === true;
    
    // Evidence for this field = the grounded sources backing it (verified fields only)
    const support = (result.fieldEvidence && result.fieldEvidence[field.name]) || [];
    const fieldSources = [...new Set(support.map(s => s.url))];
    const fieldEvidence = support
      .map(s => `${s.note || s.url}: "${String(s.text).replace(/\s+/g, ' ').trim().slice(0, 300)}"`)
      .join(' | ');
    
    await aiClient.query(`
      INSERT INTO ai_field_verification_details (
        verification_history_id, field_name, current_value, proposed_value,
        verification_status, grounded_evidence, source_urls, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (verification_history_id, field_name) DO UPDATE SET
        current_value = EXCLUDED.current_value,
        proposed_value = EXCLUDED.proposed_value,
        verification_status = EXCLUDED.verification_status,
        grounded_evidence = EXCLUDED.grounded_evidence,
        source_urls = EXCLUDED.source_urls,
        confidence = EXCLUDED.confidence,
        updated_at = now()
    `, [
      historyId,
      field.name,
      currentValue,
      proposedValue,
      isVerified ? 'verified' : 'unverified',
      fieldEvidence || null,
      fieldSources,
      isVerified ? result.confidence : 0
    ]);
  }
}

// Transient API errors are retried inside verifyLocation (they are not billed). Retrying the
// whole location here would re-bill the successful research call, so it is called once.
async function verifyWithRetry(pilotLoc) {
  return verifyLocation(pilotLoc, { budget: BUDGET });
}

let ACTIVE_RUN_ID = null;

// Locations already verified recently are skipped: re-checking costs money and
// changes little. Reads the AI tables of the selected target database.
async function dropRecentlyVerified(locations) {
  if (FORCE || locations.length === 0) return { todo: locations, skipped: [] };
  const c = new Client({ connectionString: AI_TARGET_URL });
  await c.connect();
  const { rows } = await c.query(
    `SELECT DISTINCT location_id FROM ai_location_verification_history
      WHERE location_id = ANY($1) AND result <> 'failed'
        AND verified_at > now() - make_interval(days => $2)`,
    [locations.map(l => l.id), MIN_AGE_DAYS],
  );
  await c.end();
  const recent = new Set(rows.map(r => r.location_id));
  return { todo: locations.filter(l => !recent.has(l.id)), skipped: locations.filter(l => recent.has(l.id)) };
}

async function runPilot() {
  console.log('=== Gemini Location Verification ===');
  console.log(`Mode: ${TARGET.mode} | database: ${TARGET.dbName} @ ${TARGET.host}${DRY_RUN ? ' | DRY RUN' : ''}\n`);

  const allLocations = await getLocationDetails();
  const { todo: locations, skipped } = await dropRecentlyVerified(allLocations);
  console.log(`Matched ${allLocations.length} published location(s); ${skipped.length} skipped (verified within ${MIN_AGE_DAYS} days, use --force to override); ${locations.length} to verify:`);
  locations.forEach(l => console.log(`  - ${l.name} (${l.slug}) [category: ${l.category_name || 'none'}]`));

  const worst = estimateWorstCaseCostPerLocation();
  console.log(`\nProjected worst-case cost: ${locations.length} x ₹${worst.totalCostInr.toFixed(2)} = ₹${(locations.length * worst.totalCostInr).toFixed(2)} (budget cap ₹${COST_LIMIT_INR}). Planning ceiling only; actual spend is metered per response (pricing in gemini-pricing.js).`);

  if (locations.length === 0) {
    console.log('\nNothing to verify.');
    return;
  }
  if (DRY_RUN) {
    console.log('\n--dry-run: no API calls made, nothing written.');
    return;
  }

  const aiClient = new Client({ connectionString: AI_TARGET_URL });
  await aiClient.connect();
  const { rows: [{ current_database }] } = await aiClient.query('select current_database()');
  if (current_database !== TARGET.dbName) {
    await aiClient.end();
    throw new Error(`Connected database "${current_database}" does not match selected "${TARGET.dbName}"`);
  }
  console.log(`Connected to ${TARGET.mode} database "${current_database}"`);
  
  const runId = await createMaintenanceRun(aiClient);
  ACTIVE_RUN_ID = runId;
  console.log(`\nCreated maintenance run: ${runId}`);
  
  const results = [];
  let totalCostUsd = 0;
  let totalCostInr = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalExecutionTime = 0;
  
  for (const location of locations) {
    console.log(`\n--- Verifying: ${location.name} ---`);
    
    try {
      const sanitizedPilotLoc = {
        name: sanitizeInput(location.name),
        city_name: sanitizeInput(location.city_name),
        state_name: sanitizeInput(location.state_name),
        category: location.category_name,
        pre_wedding_shoot: location.pre_wedding_shoot,
        pre_wedding_shoot_condition: location.pre_wedding_shoot_condition,
        prior_booking: location.prior_booking,
        drone_status: location.drone_status,
        drone_permission: location.drone_permission,
        entry_fee: location.entry_fee,
        shoot_permit_fee: location.shoot_permit_fee
      };
      
      const result = await verifyWithRetry(sanitizedPilotLoc);
      
      await saveVerificationResult(aiClient, runId, location.id, result, location);
      
      totalCostUsd += result.estimatedCostUsd || 0;
      totalCostInr += result.estimatedCostInr || 0;
      totalInputTokens += result.inputTokens || 0;
      totalOutputTokens += result.outputTokens || 0;
      totalExecutionTime += result.executionTimeMs || 0;
      
      results.push({ location: location.name, ...result });
      
      console.log(`  pre_wedding_shoot: ${result.pre_wedding_shoot} ${result.pre_wedding_shoot !== 'unverified' ? '✓' : '⚠ unverified'}`);
      if (result.pre_wedding_shoot_condition) console.log(`    condition: ${result.pre_wedding_shoot_condition}`);
      console.log(`  prior_booking: ${result.prior_booking}`);
      console.log(`  drone_status: ${result.drone_status} ${result.drone_status !== 'unverified' ? '✓' : '⚠ unverified'}`);
      if (result.drone_permission) console.log(`    permission: ${result.drone_permission}`);
      console.log(`  entry_fee: ${result.entry_fee}`);
      console.log(`  shoot_permit_fee: ${result.shoot_permit_fee}`);
      console.log(`  confidence: ${result.confidence}`);
      console.log(`  grounded fields: ${result.groundedFieldCount}/6 ${result.fieldVerified ? JSON.stringify(result.fieldVerified) : ''}`);
      console.log(`  sources: ${result.sources?.length || 0} (grounding: ${result.groundingQueries} queries, official: ${result.officialSourceCount}, verified: ${result.hasVerifiedSources})`);
      console.log(`  tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
      console.log(`  cost: $${result.estimatedCostUsd?.toFixed(6)} / ₹${result.estimatedCostInr?.toFixed(2)}`);
      console.log(`  time: ${result.executionTimeMs}ms`);
      
      if (totalCostInr > COST_LIMIT_INR) {
        console.log(`\n⚠ Cost limit ₹${COST_LIMIT_INR} exceeded (₹${totalCostInr.toFixed(2)}). Stopping pilot.`);
        break;
      }
      
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}`);
      results.push({ location: location.name, error: e.message });
    }
  }
  
  await aiClient.end();
  console.log(`Disconnected from ${TARGET.mode} database`);
  
  const aiClient2 = new Client({ connectionString: AI_TARGET_URL });
  await aiClient2.connect();
  const processed = results.filter(r => !r.error);
  const firstError = results.find(r => r.error)?.error;
  await updateRunStatus(aiClient2, runId, processed.length > 0 ? 'succeeded' : 'failed', {
    totalLocations: locations.length,
    processedLocations: processed.length,
    lastError: firstError ? String(firstError).slice(0, 500) : null
  });
  await aiClient2.end();
  
  console.log('\n=== PILOT COMPLETE ===');
  console.log(`\nTotal locations processed: ${results.filter(r => !r.error).length}/${locations.length}`);
  console.log(`Total input tokens: ${totalInputTokens}`);
  console.log(`Total output tokens: ${totalOutputTokens}`);
  console.log(`Total estimated cost: $${totalCostUsd.toFixed(6)} / ₹${totalCostInr.toFixed(2)}`);
  console.log(`Total execution time: ${totalExecutionTime}ms`);
  console.log(`Avg time per location: ${Math.round(totalExecutionTime / Math.max(1, results.filter(r => !r.error).length))}ms`);
  
  console.log('\n--- Per-Location Results ---');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.location}: ERROR - ${r.error}`);
    } else {
      console.log(`${r.location}: confidence=${r.confidence}, cost=₹${r.estimatedCostInr?.toFixed(2)}, time=${r.executionTimeMs}ms`);
      console.log(`  pre_wedding: ${r.pre_wedding_shoot}, drone: ${r.drone_status}, entry: ${r.entry_fee}, shoot_permit: ${r.shoot_permit_fee}, booking: ${r.prior_booking}`);
      console.log(`  grounding: ${r.groundingQueries} queries, ${r.groundedFieldCount}/6 fields grounded, official sources: ${r.officialSourceCount}`);
    }
  }
  
  const unverifiedCount = results.filter(r => !r.error && (r.pre_wedding_shoot === 'unverified' || r.drone_status === 'unverified')).length;
  const groundedCount = results.filter(r => !r.error && r.hasVerifiedSources).length;
  
  console.log(`\n--- Verification Quality ---`);
  console.log(`Locations with unverified fields: ${unverifiedCount}/${results.filter(r => !r.error).length}`);
  console.log(`Locations with ≥1 grounded field: ${groundedCount}/${results.filter(r => !r.error).length}`);
  
  console.log('\n✓ Location rows were not modified. Results stored as pending proposals only (' + TARGET.dbName + ').');
}

runPilot().catch(async e => {
  console.error('Fatal error:', e);
  // Never leave a crashed run marked 'running'.
  if (ACTIVE_RUN_ID) {
    try {
      const c = new Client({ connectionString: AI_TARGET_URL });
      await c.connect();
      await updateRunStatus(c, ACTIVE_RUN_ID, 'failed', { lastError: String(e.message || e).slice(0, 500) });
      await c.end();
    } catch (inner) {
      console.error('Could not mark run as failed:', inner.message);
    }
  }
  process.exit(1);
});
