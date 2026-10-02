import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("=== Debug date literals ===\n");

// Check what the date literal means
const r = await query(`
  SELECT 
    '2026-09-28'::date as d1,
    date '2026-09-28' as d2,
    '2026-09-28'::date - date '2026-09-28' as diff
`);
console.log('Date literals:', r[0]);

// The issue: date '2026-09-28' in SQL is interpreted differently
// Let me use a reference date that's definitely a Monday
// 2026-09-28 IS a Monday in IST
// But maybe the date literal is being parsed differently

const r2 = await query(`
  SELECT 
    v_to,
    v_to - date '2026-09-28' as diff,
    (v_to - date '2026-09-28')::int as diff_int
  FROM (SELECT '2026-09-28'::date as v_to) t
`);
console.log('With variable:', r2[0]);

// Test with known Monday: 2026-09-28
// Let's check what day of week 2026-09-28 actually is
const r3 = await query(`
  SELECT 
    '2026-09-28'::date as d,
    extract(dow from '2026-09-28'::date) as dow_sun0,
    extract(isodow from '2026-09-28'::date) as isodow_mon1
`);
console.log('Day of week for 2026-09-28:', r3[0]);

// What about using a reference date that's a Monday in the database's timezone?
// Let's use 2000-01-03 which is a Monday
const r4 = await query(`
  SELECT 
    extract(isodow from date '2000-01-03') as isodow,
    extract(isodow from date '2026-09-28') as isodow2
`);
console.log('Known Monday:', r4[0]);

// Test formula with 2000-01-03
const r5 = await query(`
  SELECT 
    '2026-09-28'::date as v_to,
    '2026-09-28'::date - date '2000-01-03' as diff,
    (('2026-09-28'::date - date '2000-01-03')::int % 7) as mod7,
    ((('2026-09-28'::date - date '2000-01-03')::int % 7) + 7) % 7 as mod7_pos,
    '2026-09-28'::date - (((('2026-09-28'::date - date '2000-01-03')::int % 7) + 7) % 7) as v_monday
`);
console.log('With 2000-01-03:', r5[0]);

// Test with v_to variable
const r6 = await query(`
  SELECT 
    v_to,
    v_to - date '2000-01-03' as diff,
    ((v_to - date '2000-01-03')::int % 7) as mod7,
    (((v_to - date '2000-01-03')::int % 7) + 7) % 7 as mod7_pos,
    v_to - (((v_to - date '2000-01-03')::int % 7) + 7) % 7 as v_monday
  FROM (SELECT '2026-09-28'::date as v_to) t
`);
console.log('With variable and 2000-01-03:', r6[0]);

await client.end();