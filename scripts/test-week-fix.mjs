import { Client } from "pg";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: DATABASE_URL });

await client.connect();

await client.query("SELECT set_config('request.jwt.claims', '{\"sub\": \"89702db9-2537-4369-94bc-0118dc75eb73\"}', false)");

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

// The function returns dates as UTC timestamps that represent IST midnight.
// So 2026-09-27T18:30:00.000Z = 2026-09-28 00:00:00 IST
// We need to convert to IST date string for comparison
function toISTDateString(d) {
  if (!d) return null;
  // d is a Date object from pg, representing UTC timestamp
  // Convert to IST by adding 5.5 hours
  const istDate = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return istDate.toISOString().split('T')[0];
}

console.log("=== Testing week calculation fix (with IST conversion) ===\n");

const testDates = [
  { date: '2026-09-28', desc: 'Monday', expStart: '2026-09-28', expEnd: '2026-09-28' },
  { date: '2026-09-29', desc: 'Tuesday', expStart: '2026-09-28', expEnd: '2026-09-29' },
  { date: '2026-09-30', desc: 'Wednesday', expStart: '2026-09-28', expEnd: '2026-09-30' },
  { date: '2026-10-01', desc: 'Thursday', expStart: '2026-09-28', expEnd: '2026-10-01' },
  { date: '2026-10-02', desc: 'Friday', expStart: '2026-09-28', expEnd: '2026-10-02' },
  { date: '2026-10-03', desc: 'Saturday', expStart: '2026-09-28', expEnd: '2026-10-03' },
  { date: '2026-10-04', desc: 'Sunday (full week)', expStart: '2026-09-28', expEnd: '2026-10-04' },
];

let allPassed = true;
for (const td of testDates) {
  const result = await query(`
    SELECT week_start, week_end 
    FROM public.get_employee_period_summary(NULL, '2026-09-01', $1)
    LIMIT 1
  `, [td.date]);
  const weekStart = toISTDateString(result[0]?.week_start);
  const weekEnd = toISTDateString(result[0]?.week_end);
  
  const passed = weekStart === td.expStart && weekEnd === td.expEnd;
  allPassed = allPassed && passed;
  console.log(`${passed ? '✓' : '✗'} ${td.desc} (p_to=${td.date}): week_start=${weekStart}, week_end=${weekEnd} ${passed ? '' : `(expected ${td.expStart} - ${td.expEnd})`}`);
}

console.log(`\n${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);

// Test clamping
console.log("\n--- Clamping tests ---");
const clampTests = [
  { from: '2026-10-01', to: '2026-10-03', expStart: '2026-09-28', expEnd: '2026-10-03', desc: 'Thu-Sat' },
  { from: '2026-10-04', to: '2026-10-04', expStart: '2026-10-04', expEnd: '2026-10-04', desc: 'Single Sunday' },
  { from: '2026-10-05', to: '2026-10-06', expStart: '2026-10-05', expEnd: '2026-10-06', desc: 'Next Mon-Tue' },
];

for (const ct of clampTests) {
  const result = await query(`
    SELECT week_start, week_end 
    FROM public.get_employee_period_summary(NULL, $1, $2)
    LIMIT 1
  `, [ct.from, ct.to]);
  const weekStart = toISTDateString(result[0]?.week_start);
  const weekEnd = toISTDateString(result[0]?.week_end);
  const passed = weekStart === ct.expStart && weekEnd === ct.expEnd;
  console.log(`${passed ? '✓' : '✗'} ${ct.desc}: ${weekStart} - ${weekEnd} (expected ${ct.expStart} - ${ct.expEnd})`);
}

await client.end();