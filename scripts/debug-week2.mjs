import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

console.log("--- Debug week calculation ---");

// Test the isodow extraction
const r = await query(`
  SELECT 
    '2026-09-28'::date as v_to,
    extract(isodow from ('2026-09-28'::date || ' 05:30:00')::timestamptz) as isodow_ist,
    extract(isodow from '2026-09-28'::date) as isodow_session
`);
console.log('isodow test:', r[0]);

// Test the full week calculation
const r2 = await query(`
  SELECT 
    v_to,
    extract(isodow from (v_to || ' 05:30:00')::timestamptz)::int as isodow,
    (7 - extract(isodow from (v_to || ' 05:30:00')::timestamptz)::int) % 7 as days_to_sun,
    (v_to + ((7 - extract(isodow from (v_to || ' 05:30:00')::timestamptz)::int) % 7))::date as computed_sunday,
    least(v_to, (v_to + ((7 - extract(isodow from (v_to || ' 05:30:00')::timestamptz)::int) % 7))::date) as v_week_end
  FROM (SELECT '2026-09-28'::date as v_to) t
`);
console.log('week_end calc:', r2[0]);

// Test week_start
const r3 = await query(`
  SELECT 
    v_week_end,
    extract(isodow from (v_week_end || ' 05:30:00')::timestamptz)::int as isodow_end,
    (v_week_end - (extract(isodow from (v_week_end || ' 05:30:00')::timestamptz)::int - 1))::date as computed_monday,
    greatest('2026-09-01'::date, (v_week_end - (extract(isodow from (v_week_end || ' 05:30:00')::timestamptz)::int - 1))::date) as v_week_start
  FROM (
    SELECT least('2026-09-28'::date, ('2026-09-28'::date + ((7 - extract(isodow from ('2026-09-28'::date || ' 05:30:00')::timestamptz)::int) % 7))::date) as v_week_end
  ) t
`);
console.log('week_start calc:', r3[0]);

// Check function source
const r4 = await query(`
  SELECT prosrc FROM pg_proc WHERE proname = 'get_employee_period_summary'
`);
console.log('Function source (first 500 chars):', r4[0].prosrc.substring(0, 500));

await client.end();