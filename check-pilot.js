require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' });

client.connect().then(async () => {
  const history = await client.query("SELECT * FROM ai_location_verification_history WHERE run_id = '1d753476-c976-4a03-af84-daf5f13ed157' ORDER BY created_at");
  console.log('=== VERIFICATIONS FOR LATEST RUN ===');
  for (const h of history.rows) {
    console.log('\n--- Location:', h.location_id, '---');
    console.log('result:', h.result);
    console.log('confidence:', h.confidence);
    console.log('grounding_queries:', h.grounding_queries);
    console.log('source_urls:', JSON.stringify(h.source_urls, null, 2));
    console.log('model:', h.model);
    console.log('input_tokens:', h.input_tokens);
    console.log('output_tokens:', h.output_tokens);
    console.log('estimated_cost_usd:', h.estimated_cost_usd);
    console.log('estimated_cost_inr:', h.estimated_cost_inr);
    console.log('execution_time_ms:', h.execution_time_ms);
  }
  await client.end();
}).catch(console.error);