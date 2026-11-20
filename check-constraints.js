require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' });
client.connect().then(async () => {
  const constraints = await client.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'ai_location_verification_history'::regclass");
  console.log('Constraints:', JSON.stringify(constraints.rows, null, 2));
  await client.end();
}).catch(console.error);