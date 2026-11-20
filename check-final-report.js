require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' });
client.connect().then(async () => {
  // Check recent runs
  const runs = await client.query("SELECT id, run_date, status, created_at FROM ai_maintenance_runs ORDER BY created_at DESC LIMIT 5");
  console.log('=== RECENT RUNS ===');
  console.log(JSON.stringify(runs.rows, null, 2));
  
  // Check latest run verifications
  const latestRun = runs.rows[0];
  const history = await client.query("SELECT location_id, result, confidence, grounding_queries, source_urls, model FROM ai_location_verification_history WHERE run_id = $1 ORDER BY created_at", [latestRun.id]);
  console.log('\n=== VERIFICATIONS FOR LATEST RUN ===');
  for (const h of history.rows) {
    console.log('\n--- Location:', h.location_id, '---');
    console.log('result:', h.result);
    console.log('confidence:', h.confidence);
    console.log('grounding_queries:', h.grounding_queries);
    console.log('source_urls:', JSON.stringify(h.source_urls, null, 2));
    console.log('model:', h.model);
  }
  
  await client.end();
}).catch(console.error);