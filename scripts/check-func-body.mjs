import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("=== Check actual function body ===\n");

const r = await query(`
  SELECT prosrc FROM pg_proc WHERE proname = 'get_employee_period_summary'
`);
console.log('Function body:');
console.log(r[0].prosrc);

await client.end();