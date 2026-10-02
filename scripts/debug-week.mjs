import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

// Set JWT claims for an active employee
await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

// Debug the week calculation
console.log("--- Debug week calculation ---");
const r = await query(`
  SELECT 
    '2026-09-28'::date as v_to,
    extract(isodow from '2026-09-28'::date)::int as isodow,
    (7 - extract(isodow from '2026-09-28'::date)::int) % 7 as days_to_sunday,
    ('2026-09-28'::date + ((7 - extract(isodow from '2026-09-28'::date)::int) % 7))::date as sunday_date
`);
console.log('Debug:', r[0]);

// Check what the function actually computes
const r2 = await query(`
  SELECT 
    v_to,
    extract(isodow from v_to)::int as isodow,
    (7 - extract(isodow from v_to)::int) % 7 as days_to_sunday,
    (v_to + ((7 - extract(isodow from v_to)::int) % 7))::date as computed_sunday,
    least(v_to, (v_to + ((7 - extract(isodow from v_to)::int) % 7))::date) as v_week_end,
    greatest('2026-09-01'::date, (least(v_to, (v_to + ((7 - extract(isodow from v_to)::int) % 7))::date) - (extract(isodow from least(v_to, (v_to + ((7 - extract(isodow from v_to)::int) % 7))::date))::int - 1))::date) as v_week_start
  FROM (SELECT '2026-09-28'::date as v_to) t
`);
console.log('Formula:', r2[0]);

// Check the actual function output
const r3 = await query(`
  SELECT week_start, week_end 
  FROM public.get_employee_period_summary(NULL, '2026-09-01', '2026-09-28')
  LIMIT 1
`);
console.log('Function result:', r3[0]);

await client.end();