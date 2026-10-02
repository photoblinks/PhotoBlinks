import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("--- Test new week calculation approach ---");

// Test the new isodow extraction: v_to::timestamp + interval '5 hours 30 minutes'
const r = await query(`
  SELECT 
    '2026-09-28'::date as v_to,
    ('2026-09-28'::date)::timestamp as midnight_utc,
    ('2026-09-28'::date)::timestamp + interval '5 hours 30 minutes' as shifted,
    extract(isodow from (('2026-09-28'::date)::timestamp + interval '5 hours 30 minutes'))::int as isodow
`);
console.log('isodow with 5.5h shift:', r[0]);

// Test the full week calculation with new formula
const r2 = await query(`
  SELECT 
    v_to,
    extract(isodow from (v_to::timestamp + interval '5 hours 30 minutes'))::int as isodow,
    (7 - extract(isodow from (v_to::timestamp + interval '5 hours 30 minutes'))::int) % 7 as days_to_sun,
    (v_to + ((7 - extract(isodow from (v_to::timestamp + interval '5 hours 30 minutes'))::int) % 7))::date as computed_sunday,
    least(v_to, (v_to + ((7 - extract(isodow from (v_to::timestamp + interval '5 hours 30 minutes'))::int) % 7))::date) as v_week_end
  FROM (SELECT '2026-09-28'::date as v_to) t
`);
console.log('week_end calc:', r2[0]);

// Test week_start
const r3 = await query(`
  SELECT 
    v_week_end,
    extract(isodow from (v_week_end::timestamp + interval '5 hours 30 minutes'))::int as isodow_end,
    (v_week_end - (extract(isodow from (v_week_end::timestamp + interval '5 hours 30 minutes'))::int - 1))::date as computed_monday,
    greatest('2026-09-01'::date, (v_week_end - (extract(isodow from (v_week_end::timestamp + interval '5 hours 30 minutes'))::int - 1))::date) as v_week_start
  FROM (
    SELECT least('2026-09-28'::date, ('2026-09-28'::date + ((7 - extract(isodow from ('2026-09-28'::date::timestamp + interval '5 hours 30 minutes'))::int) % 7))::date) as v_week_end
  ) t
`);
console.log('week_start calc:', r3[0]);

// Test all days of that week
const r4 = await query(`
  SELECT 
    d as v_to,
    extract(isodow from (d::timestamp + interval '5 hours 30 minutes'))::int as isodow
  FROM generate_series('2026-09-28'::date, '2026-10-04'::date, interval '1 day') as d
`);
console.log('All days isodow (with 5.5h shift):');
for (const row of r4) {
  console.log(`  ${row.v_to}: isodow=${row.isodow}`);
}

// Test actual function
const r5 = await query(`
  SELECT week_start, week_end 
  FROM public.get_employee_period_summary(NULL, '2026-09-01', '2026-09-28')
  LIMIT 1
`);
console.log('Function result for Mon 28:', r5[0]);

const r6 = await query(`
  SELECT week_start, week_end 
  FROM public.get_employee_period_summary(NULL, '2026-09-01', '2026-10-04')
  LIMIT 1
`);
console.log('Function result for Sun 4:', r6[0]);

await client.end();