import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("=== Test reference date approach ===\n");

// Test formula for Monday of week
const r2 = await query(`
  SELECT 
    d as v_to,
    EXTRACT(day FROM (d - '2026-09-28'::date))::int as diff_days,
    ((EXTRACT(day FROM (d - '2026-09-28'::date))::int % 7) + 7) % 7 as days_back,
    (d - ((((EXTRACT(day FROM (d - '2026-09-28'::date))::int % 7) + 7) % 7))::int) as v_monday,
    (d - ((((EXTRACT(day FROM (d - '2026-09-28'::date))::int % 7) + 7) % 7))::int + 6) as v_sunday
  FROM generate_series('2026-09-28'::date, '2026-10-04'::date, interval '1 day') as d
`);
console.log('Monday/Sunday of week:');
for (const row of r2) {
  console.log(`  ${row.v_to}: diff=${row.diff_days}, back=${row.days_back}, monday=${row.v_monday}, sunday=${row.v_sunday}`);
}

// Test for other dates
const r3 = await query(`
  SELECT 
    d as v_to,
    EXTRACT(day FROM (d - '2026-09-28'::date))::int as diff_days,
    ((EXTRACT(day FROM (d - '2026-09-28'::date))::int % 7) + 7) % 7 as days_back,
    (d - ((((EXTRACT(day FROM (d - '2026-09-28'::date))::int % 7) + 7) % 7))::int) as v_monday,
    (d - ((((EXTRACT(day FROM (d - '2026-09-28'::date))::int % 7) + 7) % 7))::int + 6) as v_sunday
  FROM generate_series('2026-10-01'::date, '2026-10-06'::date, interval '1 day') as d
`);
console.log('\nOther dates:');
for (const row of r3) {
  console.log(`  ${row.v_to}: diff=${row.diff_days}, back=${row.days_back}, monday=${row.v_monday}, sunday=${row.v_sunday}`);
}

await client.end();