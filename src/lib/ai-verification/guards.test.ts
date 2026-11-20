// Static guards for the manual verification feature: admin-only, no overwrite without approval,
// no scheduled / automatic trigger, per-location cap only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const ACTIONS = "src/app/admin/(shell)/ai-verification/run-actions.ts";
const CONTROL = "src/app/admin/(shell)/ai-verification/run-control.tsx";
const PAGE = "src/app/admin/(shell)/ai-verification/page.tsx";
const NEW_TS = [ACTIONS, CONTROL, PAGE, "src/lib/ai-verification/engine.ts", "src/lib/ai-verification/runner.ts", "src/lib/ai-verification/progress.ts"];
const MIGRATION = "supabase/migrations/20261127000000_ai_verification_run_queue.sql";

// Strip comments so documenting a prohibition does not trip a guard.
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no new code writes to the locations table", () => {
  for (const f of NEW_TS) {
    assert.doesNotMatch(code(read(f)), /from\(\s*["']locations["']\s*\)\s*\.\s*(update|insert|upsert|delete)/, f);
  }
  const sql = read(MIGRATION).replace(/--.*$/gm, "");
  assert.doesNotMatch(sql, /update\s+public\.locations|insert\s+into\s+public\.locations|delete\s+from\s+public\.locations/i);
  // the only mention of locations columns in the function bodies is a read (select ... from public.locations)
  assert.match(sql, /execute format\('select %I from public\.locations/);
});

test("no service-role client: everything runs as the signed-in administrator through RLS + admin-only functions", () => {
  for (const f of NEW_TS) assert.doesNotMatch(code(read(f)), /supabase\/admin|SERVICE_ROLE|createAdminClient/i, f);
});

test("every Server Action checks for an administrator before doing anything", () => {
  const src = read(ACTIONS);
  const exported = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(exported.sort(), [
    "cancelVerificationRun", "getRunProgress", "pauseVerificationRun", "processNextVerificationLocation",
    "resumeVerificationRun", "retryFailedLocations", "startVerificationRun",
  ]);
  for (const name of exported) {
    const body = src.slice(src.indexOf(`export async function ${name}`)).split(/\nexport async function /)[0];
    assert.match(body, /await guard\(/, `${name} must call guard()`);
  }
  assert.match(src, /checkAdmin\(supabase\)/);
});

test("every mutating SQL function re-checks is_admin() itself", () => {
  const sql = read(MIGRATION);
  for (const fn of ["ai_start_run", "ai_resume_run", "ai_pause_run", "ai_cancel_run", "ai_claim_next_location", "ai_record_location_result", "ai_fail_location", "ai_finish_run", "ai_retry_failed_locations"]) {
    const body = sql.slice(sql.indexOf(`create function public.${fn}(`)).split(/\ncreate function /)[0];
    assert.match(body, /ai_require_admin\(\)/, `${fn} must call ai_require_admin()`);
  }
  assert.match(sql, /create function public\.ai_require_admin\(\)[\s\S]*?public\.is_admin\(\)/);
});

test("no cron, schedule or automatic trigger: a run exists only because an administrator clicked", () => {
  for (const f of NEW_TS) assert.doesNotMatch(code(read(f)), /\bcron\b|node-cron|scheduled|setInterval\(\s*\w*start|ai_start_run.*useEffect/i, f);
  // vercel.json has one unrelated cron (R2 orphan sweep); none may point at AI verification.
  const vercel = JSON.parse(read("vercel.json")) as { crons?: { path: string }[] };
  for (const cron of vercel.crons ?? []) assert.doesNotMatch(cron.path, /ai|verif/i, cron.path);
  assert.deepEqual((vercel.crons ?? []).map((c) => c.path), ["/api/admin/r2-orphan-sweep"]);
  assert.doesNotMatch(read(MIGRATION).replace(/--.*$/gm, ""), /pg_cron|cron\.schedule|execute function public\.ai_(start|resume|retry)/i);
  // starting happens only from a click handler, never from an effect
  const control = read(CONTROL);
  assert.match(control, /onClick=\{\(\) => setConfirmStart\(true\)\}/);
  assert.match(control, /startVerificationRun\(\)/);
  const effects = [...control.matchAll(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\)/g)].map((m) => m[0]);
  for (const e of effects) assert.doesNotMatch(e, /startVerificationRun|resumeVerificationRun|retryFailedLocations/);
});

test("strict INR 2 per location and NO overall cap", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /ai_location_cost_cap_inr\(\)[\s\S]*?select 2::numeric/);
  assert.match(sql, /v_remain := public\.ai_location_cost_cap_inr\(\) - it\.cost_inr/);
  // no limit column / check on the run total
  assert.doesNotMatch(sql, /check\s*\(\s*total_cost_inr\s*<=?/i);
  assert.doesNotMatch(sql, /budget_limit|overall_cap|max_total/i);
  const engine = read("src/lib/ai-verification/engine.ts");
  assert.match(engine, /limitInr:\s*Number\.POSITIVE_INFINITY/); // the run has no overall limit
  assert.match(engine, /tracker\.beginLocation\(remainingInr\)/); // the per-location limit is enforced before every paid call
  assert.match(read(CONTROL), /PER_LOCATION_CAP_INR = 2/);
});

test("duplicate runs are prevented in the database, not only in the page", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create unique index ai_maintenance_runs_single_active_button_uidx[\s\S]*?where source = 'admin_button' and status in \('queued', 'running'\)/);
  assert.match(sql, /A verification run is already active/);
});

test("proposals stay pending: the recording function inserts review_status 'pending' only", () => {
  const sql = read(MIGRATION);
  const body = sql.slice(sql.indexOf("create function public.ai_record_location_result(")).split(/\ncreate function /)[0];
  assert.match(body, /'verified',[\s\S]*?'pending'\)/);
  assert.doesNotMatch(body, /'approved'/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /ai_approve_field_proposal\s*\(/);
});

test("the new tests are part of npm test", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  assert.match(pkg.scripts.test, /src\/lib\/ai-verification\/\*\.test\.ts/);
});

// ---------------------------------------------------------------------------------------------
// Production blockers: durable cost ledger + hard deadline + ownership
// ---------------------------------------------------------------------------------------------

const sqlBody = (fn: string) => read(MIGRATION).slice(read(MIGRATION).indexOf(`create function public.${fn}(`)).split(/\ncreate function /)[0];

test("the cost ledger functions are admin-only and ownership-checked", () => {
  for (const fn of ["ai_reserve_cost", "ai_confirm_cost"]) assert.match(sqlBody(fn), /ai_require_admin\(\)/, fn);
  for (const fn of ["ai_reserve_cost", "ai_record_location_result", "ai_fail_location"]) {
    assert.match(sqlBody(fn), /lease_token is distinct from p_lease/, `${fn} must check the lease token`);
    assert.match(sqlBody(fn), /it\.status <> 'running'/, `${fn} must only act on a running location`);
  }
  assert.match(sqlBody("ai_confirm_cost"), /it\.lease_token is distinct from p_lease/);
});

test("reserve refuses new paid calls without a live run lease, and refuses anything past the INR 2 cap", () => {
  const b = sqlBody("ai_reserve_cost");
  assert.match(b, /r\.status <> 'running' or r\.lease_token is distinct from p_lease or r\.lease_expires_at < now\(\)/);
  assert.match(b, /it\.cost_inr \+ it\.reserved_inr \+ p_amount > v_cap/);
  assert.match(b, /errcode = 'P0001'/);
});

test("uncertain reservations are charged in full and never released; confirmations are idempotent", () => {
  const charge = sqlBody("ai_charge_outstanding");
  assert.match(charge, /status = 'charged_uncertain', actual_inr = reserved_inr/);
  assert.match(charge, /cost_inr = cost_inr \+ v_sum/);
  assert.doesNotMatch(charge, /cost_inr = cost_inr - /, "a charge is never lowered");
  for (const fn of ["ai_resume_run", "ai_cancel_run", "ai_record_location_result", "ai_fail_location"]) {
    assert.match(sqlBody(fn), /ai_charge_outstanding\(/, `${fn} must charge what is still in flight`);
  }
  assert.match(sqlBody("ai_confirm_cost"), /if res\.status <> 'reserved' then\s+return jsonb_build_object\('already', res\.status\)/);
  // no code path releases a reservation without charging it
  assert.doesNotMatch(read(MIGRATION).replace(/--.*$/gm, ""), /reserved_inr = 0 where[\s\S]{0,40}status = 'reserved'/);
});

test("money comes only from the ledger: no client-reported cost parameter, no cost added from a result payload", () => {
  const sql = read(MIGRATION).replace(/--.*$/gm, "");
  assert.doesNotMatch(sql, /\bp_cost\b/);
  assert.doesNotMatch(sqlBody("ai_record_location_result"), /cost_inr = cost_inr \+ v_cost|total_cost_inr = total_cost_inr \+ v_cost/);
  assert.doesNotMatch(sqlBody("ai_fail_location"), /cost_inr = cost_inr \+/);
  const actions = read(ACTIONS);
  assert.doesNotMatch(actions, /p_cost/);
});

test("a location that could still be alive is never taken over, claimed twice or reset by another session", () => {
  const resume = sqlBody("ai_resume_run");
  assert.match(resume, /A location is still being processed/);
  assert.match(resume, /started_at > now\(\) - make_interval\(secs => public\.ai_item_live_seconds\(\)\)/);
  assert.match(sqlBody("ai_claim_next_location"), /where run_id = p_run_id and status = 'pending'/); // only pending locations are handed out
  assert.match(sqlBody("ai_claim_next_location"), /for update skip locked/);
});

test("timing constants: 45 s hard deadline, lease more than twice the deadline, live window = deadline + margin, inside the 60 s limit", () => {
  const sql = read(MIGRATION);
  const num = (fn: string) => Number(new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]*?select (\\d+)`).exec(sql)?.[1]);
  const deadline = num("ai_attempt_deadline_seconds");
  const lease = num("ai_lease_seconds");
  const live = num("ai_item_live_seconds");
  assert.equal(deadline, 45);
  assert.ok(lease >= 2 * deadline, `lease ${lease}s must outlive the ${deadline}s deadline more than twice`);
  assert.ok(live >= deadline + 30, `a running location is treated as alive for ${live}s (deadline + 30s margin)`);
  const page = read(PAGE);
  const maxDuration = Number(/export const maxDuration = (\d+)/.exec(page)?.[1]);
  assert.ok(maxDuration >= deadline + 10, `maxDuration ${maxDuration}s must leave room after the ${deadline}s deadline`);
});

test("the engine wires the deadline, the abort signal and the ledger", () => {
  const engine = read("src/lib/ai-verification/engine.ts");
  assert.match(engine, /cfg\.LOCATION_DEADLINE_MS/);
  assert.match(engine, /new AbortController\(\)/);
  assert.match(engine, /Promise\.race\(\[work, hardStop\]\)/);
  assert.match(engine, /signal/);
  assert.match(engine, /ledger/);
  assert.match(code(read("src/lib/ai-verification/runner.ts")), /ctx|itemId/);
  assert.match(read(ACTIONS), /makeLedger\(supabase, ctx\)/);
  assert.match(read(ACTIONS), /ai_reserve_cost/);
  assert.match(read(ACTIONS), /ai_confirm_cost/);
});
