import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("--- Test different isodow approaches ---");

// Approach 1: date::timestamp + interval
const r1 = await query(`
  SELECT 
    '2026-09-28'::date as v_to,
    ('2026-09-28'::date)::timestamp as midnight_utc,
    ('2026-09-28'::date)::timestamp + interval '5 hours 30 minutes' as ist_midnight_utc,
    extract(isodow from (('2026-09-28'::date)::timestamp + interval '5 hours 30 minutes')) as isodow
`);
console.log('Approach 1 (date::timestamp + interval):', r1[0]);

// Approach 2: make_timestamptz
const r2 = await query(`
  SELECT 
    make_timestamptz(2026, 9, 28, 0, 0, 0) as ist_midnight,
    extract(isodow from make_timestamptz(2026, 9, 28, 0, 0, 0)) as isodow
`);
console.log('Approach 2 (make_timestamptz):', r2[0]);

// Approach 3: timezone function
const r3 = await query(`
  SELECT 
    timezone('Asia/Kolkata', '2026-09-28 00:00:00+05:30'::timestamptz) as ist_time,
    extract(isodow from timezone('Asia/Kolkata', '2026-09-28 00:00:00+05:30'::timestamptz)) as isodow
`);
console.log('Approach 3 (timezone function):', r3[0]);

// Approach 4: using date directly with known epoch
// 2026-09-28 is a Monday. We can use a reference date.
const r4 = await query(`
  SELECT 
    '2026-09-28'::date - '2026-09-28'::date % 7 as ref,
    -- Days since epoch (1970-01-01 was Thursday = 4 in isodow)
    -- Actually let's just use a known Monday
    '2000-01-03'::date as known_monday,
    extract(isodow from '2000-01-03'::date) as known_monday_dow
`);
console.log('Approach 4 (reference date):', r4[0]);

// Approach 5: Add 5.5 hours to date cast to timestamp
const r5 = await query(`
  SELECT 
    v_to,
    (v_to::timestamp + interval '5 hours 30 minutes') as shifted,
    extract(isodow from (v_to::timestamp + interval '5 hours 30 minutes'))::int as isodow
  FROM (SELECT '2026-09-28'::date as v_to) t
`);
console.log('Approach 5 (v_to::timestamp + interval):', r5[0]);

// Test all days of that week
const r6 = await query(`
  SELECT 
    d as v_to,
    extract(isodow from (d::timestamp + interval '5 hours 30 minutes'))::int as isodow
  FROM generate_series('2026-09-28'::date, '2026-10-04'::date, interval '1 day') as d
`);
console.log('All days isodow (with 5.5h shift):');
for (const row of r6) {
  console.log(`  ${row.v_to}: isodow=${row.isodow}`);
}

await client.end();