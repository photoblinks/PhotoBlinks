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

// Test daily activity return types
console.log("--- Check return types ---");
const r = await query('SELECT * FROM public.get_employee_daily_activity(NULL, $1, $2)', ['2026-09-28', '2026-10-04']);
console.log('Daily activity row types:');
console.log('  activity_date:', typeof r[0].activity_date, r[0].activity_date);
console.log('  locations_added:', typeof r[0].locations_added, r[0].locations_added);
console.log('  studios_added:', typeof r[0].studios_added, r[0].studios_added);
console.log('  total_added:', typeof r[0].total_added, r[0].total_added);

// Test period summary return types
const r2 = await query('SELECT * FROM public.get_employee_period_summary(NULL, $1, $2)', ['2026-09-01', '2026-09-30']);
console.log('Period summary row types:');
console.log('  range_locations_added:', typeof r2[0].range_locations_added, r2[0].range_locations_added);
console.log('  range_studios_added:', typeof r2[0].range_studios_added, r2[0].range_studios_added);
console.log('  range_total_added:', typeof r2[0].range_total_added, r2[0].range_total_added);

await client.end();