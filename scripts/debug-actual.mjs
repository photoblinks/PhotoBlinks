import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("=== Debug actual function calculation ===\n");

// Check what the function actually computes
const r = await query(`
  SELECT 
    '2026-09-28'::date as v_to,
    ('2026-09-28'::date - date '2026-09-28') as diff_ref,
    ('2026-09-28'::date - date '2026-09-28')::int as diff_int,
    (((('2026-09-28'::date - date '2026-09-28')::int % 7) + 7) % 7) as mod7,
    '2026-09-28'::date - (((('2026-09-28'::date - date '2026-09-28')::int % 7) + 7) % 7) as v_monday
`);
console.log('Direct SQL:', r[0]);

// Test via function
const r2 = await query(`
  SELECT week_start, week_end 
  FROM public.get_employee_period_summary(NULL, '2026-09-01', '2026-09-28')
  LIMIT 1
`);
console.log('Function:', r2[0]);

await client.end();