import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("=== Debug week formula ===\n");

// Test the formula step by step
const r = await query(`
  SELECT 
    '2026-09-28'::date as v_to,
    ('2026-09-28'::date)::timestamp as midnight_utc,
    (('2026-09-28'::date)::timestamp - interval '5 hours 30 minutes') as shifted_ts,
    (('2026-09-28'::date)::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC' as shifted_tz,
    extract(isodow from (('2026-09-28'::date)::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int as isodow
`);
console.log('Monday 28:', r[0]);

// Test all days
const r2 = await query(`
  SELECT 
    d as v_to,
    extract(isodow from (d::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int as isodow
  FROM generate_series('2026-09-28'::date, '2026-10-04'::date, interval '1 day') as d
`);
console.log('All days isodow:');
for (const row of r2) {
  console.log(`  ${row.v_to}: isodow=${row.isodow}`);
}

// Test Monday formula
const r3 = await query(`
  SELECT 
    v_to,
    extract(isodow from (v_to::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int as v_to_dow,
    v_to - (extract(isodow from (v_to::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int - 1) as v_monday,
    v_to - (extract(isodow from (v_to::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int - 1) + 6 as v_sunday
  FROM (SELECT '2026-09-28'::date as v_to) t
`);
console.log('Monday formula:', r3[0]);

// Test Sunday formula
const r4 = await query(`
  SELECT 
    v_to,
    extract(isodow from (v_to::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int as v_to_dow,
    v_to - (extract(isodow from (v_to::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int - 1) as v_monday,
    v_to - (extract(isodow from (v_to::timestamp - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')::int - 1) + 6 as v_sunday
  FROM (SELECT '2026-10-04'::date as v_to) t
`);
console.log('Sunday formula:', r4[0]);

await client.end();