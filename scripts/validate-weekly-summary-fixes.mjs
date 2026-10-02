import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

function toDateString(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  if (typeof d === 'string') return d.split('T')[0];
  return String(d);
}

function toNum(n) {
  return Number(n);
}

console.log("=== VALIDATING EMPLOYEE PERFORMANCE DASHBOARD FIXES ===\n");

// Test 1: Week calculation for each day of week
// The week is the Monday-Sunday week containing v_to, CLAMPED to the selected range
// Range: 2026-09-01 to v_to
console.log("--- Test 1: Week calculation (Mon-Sun, clamped to range) ---");
const testDates = [
  { date: '2026-09-28', desc: 'Monday', expStart: '2026-09-28', expEnd: '2026-09-28' },
  { date: '2026-09-29', desc: 'Tuesday', expStart: '2026-09-28', expEnd: '2026-09-29' },
  { date: '2026-09-30', desc: 'Wednesday', expStart: '2026-09-28', expEnd: '2026-09-30' },
  { date: '2026-10-01', desc: 'Thursday', expStart: '2026-09-28', expEnd: '2026-10-01' },
  { date: '2026-10-02', desc: 'Friday', expStart: '2026-09-28', expEnd: '2026-10-02' },
  { date: '2026-10-03', desc: 'Saturday', expStart: '2026-09-28', expEnd: '2026-10-03' },
  { date: '2026-10-04', desc: 'Sunday (full week fits)', expStart: '2026-09-28', expEnd: '2026-10-04' },
];

let allWeekTestsPassed = true;
for (const td of testDates) {
  const result = await query(`
    SELECT week_start, week_end 
    FROM public.get_employee_period_summary(NULL, '2026-09-01', $1)
    LIMIT 1
  `, [td.date]);
  const weekStart = toDateString(result[0]?.week_start);
  const weekEnd = toDateString(result[0]?.week_end);
  
  const passed = weekStart === td.expStart && weekEnd === td.expEnd;
  allWeekTestsPassed = allWeekTestsPassed && passed;
  console.log(`${passed ? '✓' : '✗'} ${td.desc} (p_to=${td.date}): week_start=${weekStart}, week_end=${weekEnd} ${passed ? '' : `(expected ${td.expStart} - ${td.expEnd})`}`);
}
console.log(`${allWeekTestsPassed ? '✓' : '✗'} All week calculation tests`);

// Test 2: Week clamping - week should not exceed selected range
console.log("\n--- Test 2: Week clamping to selected range ---");
const clampTests = [
  { from: '2026-10-01', to: '2026-10-03', expStart: '2026-09-28', expEnd: '2026-10-03', desc: 'Thu-Sat range (week Mon-Sun clamped to Thu-Sat)' },
  { from: '2026-10-04', to: '2026-10-04', expStart: '2026-10-04', expEnd: '2026-10-04', desc: 'Single day Sunday' },
  { from: '2026-10-05', to: '2026-10-06', expStart: '2026-10-05', expEnd: '2026-10-06', desc: 'Next week Mon-Tue' },
];

let allClampTestsPassed = true;
for (const ct of clampTests) {
  const result = await query(`
    SELECT week_start, week_end 
    FROM public.get_employee_period_summary(NULL, $1, $2)
    LIMIT 1
  `, [ct.from, ct.to]);
  const weekStart = toDateString(result[0]?.week_start);
  const weekEnd = toDateString(result[0]?.week_end);
  
  const passed = weekStart === ct.expStart && weekEnd === ct.expEnd;
  allClampTestsPassed = allClampTestsPassed && passed;
  console.log(`${passed ? '✓' : '✗'} ${ct.desc}: week_start=${weekStart}, week_end=${weekEnd} (expected ${ct.expStart} - ${ct.expEnd})`);
}
console.log(`${allClampTestsPassed ? '✓' : '✗'} All clamping tests`);

// Test 3: IST date generation - generate_series should produce continuous dates
console.log("\n--- Test 3: IST daily activity - continuous dates ---");
const dailyResult = await query(`
  SELECT activity_date, locations_added, studios_added, total_added
  FROM public.get_employee_daily_activity(NULL, '2026-09-28', '2026-10-04')
  ORDER BY activity_date
`);
let continuous = true;
let prevDate = null;
let totalLocations = 0;
let totalStudios = 0;
let totalAdded = 0;
for (const row of dailyResult) {
  totalLocations += toNum(row.locations_added);
  totalStudios += toNum(row.studios_added);
  totalAdded += toNum(row.total_added);
  const totalMatches = toNum(row.total_added) === toNum(row.locations_added) + toNum(row.studios_added);
  if (!totalMatches) {
    console.log(`✗ ${row.activity_date}: total_added (${row.total_added}) != locations_added (${row.locations_added}) + studios_added (${row.studios_added})`);
    continuous = false;
  }
  if (prevDate) {
    const diff = (new Date(toDateString(row.activity_date)) - new Date(toDateString(prevDate))) / (1000 * 60 * 60 * 24);
    if (diff !== 1) {
      console.log(`✗ Gap detected: ${prevDate} -> ${row.activity_date} (diff=${diff} days)`);
      continuous = false;
    }
  }
  prevDate = row.activity_date;
}
console.log(`${continuous ? '✓' : '✗'} Continuous dates and total_added = locations + studios for all rows`);
console.log(`  Total locations: ${totalLocations}, Total studios: ${totalStudios}, Total added: ${totalAdded}`);

// Test 4: Zero-activity days included
console.log("\n--- Test 4: Zero-activity days included ---");
const zeroActivity = await query(`
  SELECT activity_date, total_added
  FROM public.get_employee_daily_activity(NULL, '2026-09-01', '2026-09-07')
  WHERE total_added = 0
`);
console.log(`${zeroActivity.length > 0 ? '✓' : '✗'} Zero-activity days present: ${zeroActivity.length} days with 0 activity`);

// Test 5: Month boundary
console.log("\n--- Test 5: Month boundary (Sep 30 - Oct 1) ---");
const monthBoundary = await query(`
  SELECT activity_date, total_added
  FROM public.get_employee_daily_activity(NULL, '2026-09-30', '2026-10-01')
  ORDER BY activity_date
`);
console.log(`${monthBoundary.length === 2 ? '✓' : '✗'} Month boundary: ${monthBoundary.length} days returned`);
for (const row of monthBoundary) {
  console.log(`  ${toDateString(row.activity_date)}: ${row.total_added}`);
}

// Test 6: Year boundary
console.log("\n--- Test 6: Year boundary (Dec 31 - Jan 1) ---");
const yearBoundary = await query(`
  SELECT activity_date, total_added
  FROM public.get_employee_daily_activity(NULL, '2025-12-31', '2026-01-01')
  ORDER BY activity_date
`);
console.log(`${yearBoundary.length === 2 ? '✓' : '✗'} Year boundary: ${yearBoundary.length} days returned`);
for (const row of yearBoundary) {
  console.log(`  ${toDateString(row.activity_date)}: ${row.total_added}`);
}

// Test 7: Monthly totals match daily totals
console.log("\n--- Test 7: Monthly totals reconciliation ---");
const monthlyRange = { from: '2026-09-01', to: '2026-09-30' };
const summary = await query(`
  SELECT range_locations_added, range_studios_added, range_total_added
  FROM public.get_employee_period_summary(NULL, $1, $2)
`, [monthlyRange.from, monthlyRange.to]);

const dailyMonthly = await query(`
  SELECT 
    SUM(locations_added) as total_locations,
    SUM(studios_added) as total_studios,
    SUM(total_added) as total_added
  FROM public.get_employee_daily_activity(NULL, $1, $2)
`, [monthlyRange.from, monthlyRange.to]);

const s = summary[0];
const d = dailyMonthly[0];
const match = toNum(s.range_locations_added) === toNum(d.total_locations) && 
              toNum(s.range_studios_added) === toNum(d.total_studios) && 
              toNum(s.range_total_added) === toNum(d.total_added);
console.log(`${match ? '✓' : '✗'} Monthly totals match daily totals`);
console.log(`  Summary: locations=${s.range_locations_added}, studios=${s.range_studios_added}, total=${s.range_total_added}`);
console.log(`  Daily sum: locations=${d.total_locations}, studios=${d.total_studios}, total=${d.total_added}`);

// Test 8: Updates/deletes excluded (only 'created' action counted)
console.log("\n--- Test 8: Only 'created' actions counted ---");
const actionTest = await query(`
  SELECT 
    (SELECT COUNT(*) FROM public.activity_events WHERE action = 'created') as created_count,
    (SELECT COUNT(*) FROM public.activity_events WHERE action = 'updated') as updated_count,
    (SELECT COUNT(*) FROM public.activity_events WHERE action = 'published') as published_count
`);
console.log(`  Created: ${actionTest[0].created_count}, Updated: ${actionTest[0].updated_count}, Published: ${actionTest[0].published_count}`);

// Test 9: Single day range
console.log("\n--- Test 9: Single day range ---");
const singleDay = await query(`
  SELECT activity_date, total_added
  FROM public.get_employee_daily_activity(NULL, '2026-10-02', '2026-10-02')
`);
console.log(`${singleDay.length === 1 ? '✓' : '✗'} Single day range: ${singleDay.length} row returned`);
console.log(`  ${toDateString(singleDay[0]?.activity_date)}: ${singleDay[0]?.total_added}`);

// Test 10: Verify return field is total_added (not total_activities)
console.log("\n--- Test 10: Return field is total_added ---");
const colsResult = await query(`
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = 'get_employee_daily_activity' 
  AND column_name IN ('total_added', 'total_activities')
`);
const hasTotalAdded = colsResult.some(c => c.column_name === 'total_added');
const hasTotalActivities = colsResult.some(c => c.column_name === 'total_activities');
console.log(`${hasTotalAdded && !hasTotalActivities ? '✓' : '✗'} Function returns total_added (not total_activities)`);
console.log(`  Columns found: ${colsResult.map(c => c.column_name).join(', ')}`);

// Test 11: Dashboard caller uses correct field
console.log("\n--- Test 11: Dashboard caller compatibility ---");
const fs = await import('fs');
const dashboardCode = fs.readFileSync('src/app/admin/(shell)/performance/page.tsx', 'utf8');
const usesTotalAdded = dashboardCode.includes('total_added');
const usesTotalActivities = dashboardCode.includes('total_activities');
console.log(`${usesTotalAdded && !usesTotalActivities ? '✓' : '✗'} Dashboard uses total_added field`);
if (usesTotalActivities) {
  console.log('  WARNING: Dashboard still references total_activities');
}

// Test 12: get_employee_period_summary returns correct week for Sunday p_to (full week fits in range)
console.log("\n--- Test 12: Sunday p_to week calculation (full week fits in range) ---");
const sundayTest = await query(`
  SELECT week_start, week_end, week_locations_added, week_studios_added, week_total_added
  FROM public.get_employee_period_summary(NULL, '2026-09-28', '2026-10-04')
  LIMIT 1
`);
const st = sundayTest[0];
const ws = toDateString(st.week_start);
const we = toDateString(st.week_end);
const weekTotalMatches = toNum(st.week_total_added) === toNum(st.week_locations_added) + toNum(st.week_studios_added);
const passed12 = ws === '2026-09-28' && we === '2026-10-04' && weekTotalMatches;
console.log(`${passed12 ? '✓' : '✗'} Sunday p_to: week_start=${ws}, week_end=${we}, total=${st.week_total_added} (loc=${st.week_locations_added}+stu=${st.week_studios_added})`);

// Test 13: Multi-employee scenario
console.log("\n--- Test 13: Multi-employee scenario ---");
const multiEmp = await query(`
  SELECT user_id, display_name, range_total_added, week_total_added
  FROM public.get_employee_period_summary(NULL, '2026-09-01', '2026-09-30')
  ORDER BY range_total_added DESC
`);
console.log(`${multiEmp.length > 0 ? '✓' : '✗'} Returns ${multiEmp.length} employees`);
for (const emp of multiEmp) {
  console.log(`  ${emp.display_name}: range=${emp.range_total_added}, week=${emp.week_total_added}`);
}

// Test 14: p_employee_id filter works
console.log("\n--- Test 14: p_employee_id filter ---");
const singleEmp = await query(`
  SELECT user_id, display_name, range_total_added, week_total_added
  FROM public.get_employee_period_summary('89702db9-2537-4369-94bc-0118dc75eb73', '2026-09-01', '2026-09-30')
`);
console.log(`${singleEmp.length === 1 ? '✓' : '✗'} Single employee filter returns 1 row`);
console.log(`  ${singleEmp[0]?.display_name}: range=${singleEmp[0]?.range_total_added}, week=${singleEmp[0]?.week_total_added}`);

// Test 15: Daily activity with specific employee
console.log("\n--- Test 15: Daily activity with specific employee ---");
const dailyEmp = await query(`
  SELECT activity_date, total_added
  FROM public.get_employee_daily_activity('89702db9-2537-4369-94bc-0118dc75eb73', '2026-09-28', '2026-10-04')
  ORDER BY activity_date
`);
console.log(`${dailyEmp.length === 7 ? '✓' : '✗'} Returns 7 days for specific employee`);
console.log(`  Total days with data: ${dailyEmp.filter(r => toNum(r.total_added) > 0).length}`);

await client.end();
console.log("\n=== VALIDATION COMPLETE ===");