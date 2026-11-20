// Behaviour test for supabase/migrations/20261127000000_ai_verification_run_queue.sql.
//
//   node scripts/test-ai-run-queue-migration.mjs <postgres-url-of-a-LOCAL-db-with-the-migrations-applied>
//
// One transaction, rolled back at the end. Refuses any non-local host. Needs >= 3 published
// locations; seeds its own test users (rolled back too).
import pg from "pg";

const url = process.argv[2];
if (!url) throw new Error("usage: node scripts/test-ai-run-queue-migration.mjs <postgres-url>");
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`refusing non-local host ${host}`);

const ADMIN = "0907731a-94e6-4303-bf6e-bad04d6ec5a1";
const PUB = "dad06cc4-52af-4ce9-8f35-77a10039cc0b";
const NONE = "d1d51c91-81bc-4684-8f74-bde8e01dd382";
const ZERO = "00000000-0000-0000-0000-000000000000";

const c = new pg.Client({ connectionString: url });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
const as = async (u) => {
  await c.query("reset role");
  if (u === "anon") return c.query("set local role anon");
  if (u) {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: u, role: "authenticated" })]);
  }
};
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`);
};
const attempt = async (fn) => {
  await c.query("savepoint s");
  try {
    return { value: await fn() };
  } catch (e) {
    return { code: e.code, message: e.message };
  } finally {
    await c.query("rollback to savepoint s");
  }
};
const expectErr = async (name, fn, code, msgPart) => {
  const r = await attempt(fn);
  check(name, (code === undefined ? r.code !== undefined : r.code === code) && (!msgPart || r.message.includes(msgPart)), `got ${r.code}: ${r.message ?? JSON.stringify(r.value)}`);
};
const rpc = async (sql, params) => (await q(`select ${sql} as r`, params))[0].r;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

try {
  await c.query("begin");
  await c.query("insert into auth.users(id,email,aud,role) values ($1,'a@t.l','authenticated','authenticated'),($2,'p@t.l','authenticated','authenticated'),($3,'n@t.l','authenticated','authenticated') on conflict (id) do nothing", [ADMIN, PUB, NONE]);
  await c.query("insert into admins(user_id) values ($1) on conflict do nothing", [ADMIN]);
  const pubRole = (await q("insert into employee_roles(name,slug) values ('Publish Only','publishonly') returning id"))[0].id;
  const noRole = (await q("insert into employee_roles(name,slug) values ('No Loc','noloc') returning id"))[0].id;
  await c.query("insert into employee_role_permissions(role_id,permission_id) select $1,id from employee_permissions where code='locations.publish'", [pubRole]);
  await c.query("insert into employee_role_permissions(role_id,permission_id) select $1,id from employee_permissions where code='dashboard.view'", [noRole]);
  await c.query("delete from employees where user_id in ($1,$2)", [PUB, NONE]);
  await c.query("insert into employees(user_id,role_id,is_active) values ($1,$2,true),($3,$4,true)", [PUB, pubRole, NONE, noRole]);
  await c.query("delete from ai_maintenance_runs where source = 'admin_button'");

  const published = await q("select id, name from locations where is_published order by name");
  check("needs at least 3 published locations", published.length >= 3, String(published.length));
  const snapshot = async () => (await q("select md5(string_agg(to_jsonb(l)::text, '|' order by id)) h from locations l"))[0].h;
  const item = async (id) => (await q("select * from ai_run_locations where id=$1", [id]))[0];
  const runRow = async (id) => (await q("select * from ai_maintenance_runs where id=$1", [id]))[0];
  const ledgerSum = async (runId) => Number((await q("select coalesce(sum(actual_inr),0) s from ai_cost_reservations r join ai_run_locations i on i.id=r.item_id where i.run_id=$1 and r.status <> 'reserved'", [runId]))[0].s);
  const locationsBefore = await snapshot();
  // reserve BEFORE the paid call, confirm RIGHT AFTER it
  const spend = async (run, lease, itemId, kind, reserve, actual, tokens = {}) => {
    const r = await rpc("public.ai_reserve_cost($1,$2,$3,$4,$5)", [run, lease, itemId, kind, reserve]);
    await rpc("public.ai_confirm_cost($1,$2,$3,$4,$5,$6)", [run, lease, r.reservation_id, actual, tokens.in ?? 0, tokens.out ?? 0]);
    return r.reservation_id;
  };

  // ---------------- access control ----------------
  for (const [who, label] of [[PUB, "publish-only employee"], [NONE, "employee without location access"], ["anon", "anonymous"]]) {
    await as(who);
    await expectErr(`${label} cannot start a run`, () => q("select public.ai_start_run()"), "42501");
  }
  await as(PUB);
  await expectErr("employee cannot insert queue rows directly", () => q("insert into ai_run_locations(run_id,location_id,position) values (gen_random_uuid(),gen_random_uuid(),1)"), "42501");
  await expectErr("employee cannot write the cost ledger directly", () => q("insert into ai_cost_reservations(item_id,kind,reserved_inr) values (gen_random_uuid(),'search',0.4)"), "42501");
  await expectErr("employee cannot insert runs directly", () => q("insert into ai_maintenance_runs(run_date,source) values (current_date,'admin_button')"), "42501");

  // ---------------- eligibility ----------------
  await c.query("reset role");
  const ELIGIBLE_SQL = "select count(*)::int n from locations l where l.is_published and not exists (select 1 from ai_location_verification_history h where h.location_id=l.id and h.result<>'failed' and h.verified_at > now() - interval '30 days')";
  const expected30 = (await q(ELIGIBLE_SQL))[0].n;
  await as(ADMIN);
  check("eligible count matches live locations without a recent check", (await rpc("public.ai_eligible_location_count()")) === expected30, "expected " + expected30);
  check("min-age 0 makes every live location eligible", (await rpc("public.ai_eligible_location_count(0)")) === published.length);

  // ---------------- start + duplicate prevention ----------------
  const started = await rpc("public.ai_start_run(0)");
  const run = started.run_id;
  let lease = started.lease_token;
  check("start queues every eligible location", started.total === published.length, JSON.stringify(started));
  const row = await runRow(run);
  check("run is a running admin_button run with lease + zero spend", row.status === "running" && row.source === "admin_button" && row.lease_token === lease && Number(row.total_cost_inr) === 0);
  await expectErr("second start is refused while a run is active", () => q("select public.ai_start_run(0)"), "55000", "already active");
  await c.query("reset role");
  await expectErr("database index also blocks a second active run", () => q("insert into ai_maintenance_runs(run_date,source,status) values (current_date,'admin_button','queued')"), "23505");
  await as(ADMIN);
  await expectErr("non-admin cannot pause", async () => { await as(PUB); await q("select public.ai_pause_run($1)", [run]); }, "42501");
  await as(ADMIN);

  // ---------------- claim ----------------
  await expectErr("claim with a wrong lease is refused", () => q("select public.ai_claim_next_location($1,$2)", [run, ZERO]), "55000");
  const c1 = await rpc("public.ai_claim_next_location($1,$2)", [run, lease]);
  check("claim returns the first location: cap remaining 2, 45 s deadline, existing values", c1 && c1.attempt === 1 && Number(c1.remaining_inr) === 2 && c1.deadline_seconds === 45 && "existing" in c1 && c1.name === published[0].name, JSON.stringify(c1));

  // ---------------- cost ledger ----------------
  await expectErr("reserve with a wrong lease is refused", () => q("select public.ai_reserve_cost($1,$2,$3,'search',0.4)", [run, ZERO, c1.item_id]), "55000");
  await expectErr("reserve with a wrong item is refused", () => q("select public.ai_reserve_cost($1,$2,$3,'search',0.4)", [run, lease, ZERO]), "55000");
  await expectErr("a reservation above the cap is refused", () => q("select public.ai_reserve_cost($1,$2,$3,'model',2.5)", [run, lease, c1.item_id]));
  const r1 = await rpc("public.ai_reserve_cost($1,$2,$3,'search',0.415)", [run, lease, c1.item_id]);
  check("reserve records an in-flight (uncertain) amount before the call", near((await item(c1.item_id)).reserved_inr, 0.415) && near(r1.remaining_inr, 2 - 0.415), JSON.stringify(r1));
  const conf1 = await rpc("public.ai_confirm_cost($1,$2,$3,0.415,0,0)", [run, lease, r1.reservation_id]);
  check("confirm moves it to confirmed spend immediately (item and run)", near((await item(c1.item_id)).cost_inr, 0.415) && near((await item(c1.item_id)).reserved_inr, 0) && near((await runRow(run)).total_cost_inr, 0.415) && near(conf1.item_cost_inr, 0.415));
  const dup = await rpc("public.ai_confirm_cost($1,$2,$3,0.415,0,0)", [run, lease, r1.reservation_id]);
  check("confirming twice does not double count", dup.already === "confirmed" && near((await item(c1.item_id)).cost_inr, 0.415) && near((await runRow(run)).total_cost_inr, 0.415));
  await spend(run, lease, c1.item_id, "search", 0.415, 0.415);
  const rm = await rpc("public.ai_reserve_cost($1,$2,$3,'model',0.85)", [run, lease, c1.item_id]);
  await expectErr("a reservation that would pass INR 2 in total is refused", () => q("select public.ai_reserve_cost($1,$2,$3,'model',0.8)", [run, lease, c1.item_id]), "P0001", "cap would be exceeded");
  await rpc("public.ai_confirm_cost($1,$2,$3,0.07,2000,300)", [run, lease, rm.reservation_id]);
  const i1 = await item(c1.item_id);
  check("ledger totals: 0.415 + 0.415 + 0.07 = 0.9, 2 searches, tokens kept", near(i1.cost_inr, 0.9) && i1.searches === 2 && i1.input_tokens === 2000 && i1.output_tokens === 300 && near(i1.reserved_inr, 0));

  // ---------------- record: pending proposals only, locations untouched ----------------
  const loc = (await q("select entry_fee, pre_wedding_shoot from locations where id=$1", [c1.location_id]))[0];
  const rec = await rpc("public.ai_record_location_result($1,$2,$3,$4::jsonb)", [run, lease, c1.item_id, JSON.stringify({
    cost_inr: 99, model: "gemini-3.1-flash-lite", confidence: 0.5, summary: "s",
    source_urls: ["https://karnatakatourism.org/x", "http://insecure.example/y"], verified_count: 5,
    proposals: [
      { field: "entry_fee", proposed_value: "₹40-test", evidence: "Entry fee: ₹40", source_urls: ["https://karnatakatourism.org/x"], confidence: 0.5 },
      { field: "drone_permission", proposed_value: "unknown", evidence: "x", source_urls: ["https://a.example"] },
      { field: "prior_booking", proposed_value: "Advance booking", evidence: "", source_urls: ["https://a.example"] },
      { field: "shoot_permit_fee", proposed_value: "₹750", evidence: "e", source_urls: ["http://insecure.example"] },
      { field: "drone_status", proposed_value: "bogus", evidence: "e", source_urls: ["https://a.example"] },
      { field: "not_a_field", proposed_value: "x", evidence: "e", source_urls: ["https://a.example"] },
      { field: "pre_wedding_shoot", proposed_value: loc.pre_wedding_shoot ?? "conditional", evidence: "e", source_urls: ["https://a.example"] },
    ],
  })]);
  const details = await q("select field_name, current_value, proposed_value, review_status, verification_status from ai_field_verification_details where verification_history_id=$1", [rec.history_id]);
  const fees = details.filter((d) => d.field_name === "entry_fee");
  check("only the valid proposal is created, pending + verified, based on the CURRENT value", fees.length === 1 && details.length <= 2 && fees[0].review_status === "pending" && fees[0].verification_status === "verified" && fees[0].current_value === loc.entry_fee && !details.some((d) => ["drone_permission", "prior_booking", "shoot_permit_fee", "drone_status", "not_a_field"].includes(d.field_name)), JSON.stringify(details));
  const hist = (await q("select * from ai_location_verification_history where id=$1", [rec.history_id]))[0];
  check("history row takes cost + tokens + searches from the LEDGER (not from the payload)", hist.result === "changes_found" && hist.is_latest && near(hist.estimated_cost_inr, 0.9) && hist.input_tokens === 2000 && hist.grounding_queries === 2 && hist.source_urls.length === 1);
  check("a payload cost of 99 changes nothing (no double counting, only a note)", near((await runRow(run)).total_cost_inr, 0.9) && (await item(c1.item_id)).last_error?.includes("above the ledger"));
  check("locations table is byte-for-byte unchanged (no overwrite without approval)", (await snapshot()) === locationsBefore);
  await expectErr("recording the same item twice is refused", () => q("select public.ai_record_location_result($1,$2,$3,'{}'::jsonb)", [run, lease, c1.item_id]), "55000");

  // ---------------- BLOCKER 1 regression: a killed attempt can no longer break the INR 2 cap ----------------
  const c2 = await rpc("public.ai_claim_next_location($1,$2)", [run, lease]);
  await spend(run, lease, c2.item_id, "search", 0.415, 0.415);
  const killed = await rpc("public.ai_reserve_cost($1,$2,$3,'model',0.85)", [run, lease, c2.item_id]); // model call in flight ...
  // ... and the request is killed: no confirmation will ever arrive.
  check("an in-flight call is held as an uncertain reservation", near((await item(c2.item_id)).reserved_inr, 0.85) && near((await item(c2.item_id)).cost_inr, 0.415));
  await c.query("reset role");
  await c.query("update ai_maintenance_runs set lease_expires_at = now() - interval '1 minute' where id=$1", [run]);
  await as(ADMIN);
  await expectErr("resume is refused while the killed attempt could still be alive (second worker cannot take it over)", () => q("select public.ai_resume_run($1)", [run]), "55000", "still being processed");
  await expectErr("the old session cannot start new paid calls once its lease has expired", () => q("select public.ai_reserve_cost($1,$2,$3,'search',0.4)", [run, lease, c2.item_id]), "55000");
  await c.query("reset role");
  await c.query("update ai_run_locations set started_at = now() - interval '2 minutes' where id=$1", [c2.item_id]); // the attempt is now certainly dead
  await as(ADMIN);
  const zombieLease = lease;
  const resumed = await rpc("public.ai_resume_run($1)", [run]);
  lease = resumed.lease_token;
  const i2 = await item(c2.item_id);
  check("the uncertain reservation is CHARGED IN FULL on resume, never released", near(i2.cost_inr, 0.415 + 0.85) && near(i2.uncertain_inr, 0.85) && near(i2.reserved_inr, 0) && i2.status === "pending", JSON.stringify(i2));
  check("the run total includes the pessimistic charge", near((await runRow(run)).total_cost_inr, 0.9 + 0.415 + 0.85));
  const late = await attempt(() => rpc("public.ai_confirm_cost($1,$2,$3,0.07,0,0)", [run, lease, killed.reservation_id]));
  check("a late confirmation of the killed call is ignored: no double count", late.value?.already === "charged_uncertain" && near((await item(c2.item_id)).cost_inr, 1.265), JSON.stringify(late));
  const c2b = await rpc("public.ai_claim_next_location($1,$2)", [run, lease]);
  check("the retry only gets what is LEFT of the INR 2 (not a fresh 2)", c2b.item_id === c2.item_id && c2b.attempt === 2 && near(c2b.remaining_inr, 2 - 1.265), JSON.stringify(c2b));
  await rpc("public.ai_reserve_cost($1,$2,$3,'search',0.415)", [run, lease, c2b.item_id]);
  await expectErr("a second search would take this location past INR 2, so it is refused", () => q("select public.ai_reserve_cost($1,$2,$3,'search',0.415)", [run, lease, c2b.item_id]), "P0001", "cap would be exceeded");
  const w = await item(c2.item_id);
  check("worst-case spend for the location is <= INR 2 (it was INR 2.93 before the ledger)", Number(w.cost_inr) + Number(w.reserved_inr) <= 2 + 1e-9, String(Number(w.cost_inr) + Number(w.reserved_inr)));
  await rpc("public.ai_fail_location($1,$2,$3,'test: stop',false)", [run, lease, c2b.item_id]);
  check("closing an attempt charges its still-reserved call in full", near((await item(c2.item_id)).cost_inr, 1.265 + 0.415) && near((await item(c2.item_id)).reserved_inr, 0));

  // ---------------- BLOCKER 2 regression: ownership while a location is active ----------------
  await expectErr("the previous session's lease cannot claim", () => q("select public.ai_claim_next_location($1,$2)", [run, zombieLease]), "55000");
  const c3 = await rpc("public.ai_claim_next_location($1,$2)", [run, lease]);
  check("a different location is handed out (a running location is never claimed twice)", c3 && c3.item_id !== c1.item_id && c3.item_id !== c2.item_id);
  await expectErr("another session (old lease) cannot reserve for the active location", () => q("select public.ai_reserve_cost($1,$2,$3,'search',0.4)", [run, zombieLease, c3.item_id]), "55000");
  await expectErr("another session cannot record the active location", () => q("select public.ai_record_location_result($1,$2,$3,'{}'::jsonb)", [run, zombieLease, c3.item_id]), "55000");
  await expectErr("another session cannot fail the active location", () => q("select public.ai_fail_location($1,$2,$3,'x',true)", [run, zombieLease, c3.item_id]), "55000");
  const r3 = await rpc("public.ai_reserve_cost($1,$2,$3,'search',0.415)", [run, lease, c3.item_id]);
  await expectErr("another session cannot confirm the active location's reservation", () => q("select public.ai_confirm_cost($1,$2,$3,0.1,0,0)", [run, zombieLease, r3.reservation_id]), "55000");
  await rpc("public.ai_pause_run($1,'test pause')", [run]);
  await expectErr("resume right after a pause is refused while the location is still being processed", () => q("select public.ai_resume_run($1)", [run]), "55000", "still being processed");
  await expectErr("a paused run refuses NEW paid calls", () => q("select public.ai_reserve_cost($1,$2,$3,'search',0.4)", [run, lease, c3.item_id]), "55000");
  const conf3 = await rpc("public.ai_confirm_cost($1,$2,$3,0.415,0,0)", [run, lease, r3.reservation_id]);
  check("but the in-flight call can still be confirmed after a pause (paid work is not lost)", near(conf3.item_cost_inr, 0.415));
  const lateRec = await rpc("public.ai_record_location_result($1,$2,$3,$4::jsonb)", [run, lease, c3.item_id, JSON.stringify({ proposals: [] })]);
  check("and its result can still be recorded", lateRec.result === "inconclusive");

  // resume after the pause, then cancel with a call in flight: it is charged in full
  const resumed2 = await rpc("public.ai_resume_run($1)", [run]);
  lease = resumed2.lease_token;
  const c4 = await rpc("public.ai_claim_next_location($1,$2)", [run, lease]);
  if (c4) {
    const inflight = await rpc("public.ai_reserve_cost($1,$2,$3,'model',0.6)", [run, lease, c4.item_id]);
    const before = Number((await runRow(run)).total_cost_inr);
    await rpc("public.ai_cancel_run($1)", [run]);
    check("cancel charges the in-flight reservation in full", near((await item(c4.item_id)).cost_inr, 0.6) && near((await item(c4.item_id)).uncertain_inr, 0.6) && near((await runRow(run)).total_cost_inr, before + 0.6));
    check("the cancelled run is final", (await runRow(run)).status === "cancelled");
    const lateC = await attempt(() => rpc("public.ai_confirm_cost($1,$2,$3,0.1,0,0)", [run, lease, inflight.reservation_id]));
    check("a late confirmation after cancel is ignored", lateC.value?.already === "charged_uncertain" && near((await item(c4.item_id)).cost_inr, 0.6), JSON.stringify(lateC));
  }

  // ---------------- failure handling, retries, caps on a fresh run ----------------
  const again = await rpc("public.ai_start_run(0)");
  check("after cancel a new run can be started", !!again.run_id);
  const run2 = again.run_id;
  const lease2 = again.lease_token;
  const d1 = await rpc("public.ai_claim_next_location($1,$2)", [run2, lease2]);
  await spend(run2, lease2, d1.item_id, "search", 0.415, 0.415);
  await spend(run2, lease2, d1.item_id, "search", 0.415, 0.415);
  const f1 = await rpc("public.ai_fail_location($1,$2,$3,'Gemini timeout',true)", [run2, lease2, d1.item_id]);
  check("first failure is retried; its ledgered cost is kept", f1.will_retry === true && near(f1.item_cost_inr, 0.83));
  const d1b = await rpc("public.ai_claim_next_location($1,$2)", [run2, lease2]);
  check("the retry has only the REMAINING per-location budget", d1b.item_id === d1.item_id && d1b.attempt === 2 && near(d1b.remaining_inr, 2 - 0.83));
  await spend(run2, lease2, d1b.item_id, "search", 0.415, 0.415);
  const f2 = await rpc("public.ai_fail_location($1,$2,$3,'Gemini timeout again',true)", [run2, lease2, d1b.item_id]);
  check("second failure is final: no third attempt", f2.will_retry === false && (await item(d1.item_id)).status === "failed" && near((await item(d1.item_id)).cost_inr, 1.245));
  check("a 'failed' history row carries the ledgered cost and the failure is counted", (await q("select count(*)::int n from ai_location_verification_history where run_id=$1 and result='failed' and estimated_cost_inr > 1.2", [run2]))[0].n === 1 && (await runRow(run2)).failed_locations === 1);

  // per-location cap: a location that already spent 1.7 is never handed out
  await c.query("reset role");
  const third = (await q("select id from ai_run_locations where run_id=$1 and status='pending' order by position limit 1", [run2]))[0];
  await c.query("update ai_run_locations set cost_inr = 1.7 where id=$1", [third.id]);
  await c.query("update ai_maintenance_runs set total_cost_inr = total_cost_inr + 1.7 where id=$1", [run2]);
  await as(ADMIN);
  let cur = await rpc("public.ai_claim_next_location($1,$2)", [run2, lease2]);
  check("a location with 1.7 already charged is budget_exhausted, not processed", (await item(third.id)).status === "budget_exhausted" && (!cur || cur.item_id !== third.id));

  // finish
  await expectErr("finish is refused while locations are pending", () => q("select public.ai_finish_run($1,$2)", [run2, lease2]), "55000", "still has");
  for (let i = 0; i < 100; i++) {
    if (!cur) cur = await rpc("public.ai_claim_next_location($1,$2)", [run2, lease2]);
    if (!cur) break;
    await spend(run2, lease2, cur.item_id, "search", 0.415, 0.1);
    await rpc("public.ai_record_location_result($1,$2,$3,$4::jsonb)", [run2, lease2, cur.item_id, JSON.stringify({ proposals: [] })]);
    cur = null;
  }
  const fin = await rpc("public.ai_finish_run($1,$2)", [run2, lease2]);
  check("finish marks the run succeeded", fin.status === "succeeded");
  const tot = await runRow(run2);
  const itemSum = Number((await q("select sum(cost_inr) s from ai_run_locations where run_id=$1", [run2]))[0].s);
  check("every location accounted for; run total = sum of per-location costs", tot.processed_locations === tot.total_locations && near(tot.total_cost_inr, itemSum), JSON.stringify({ p: tot.processed_locations, t: tot.total_locations, run: tot.total_cost_inr, items: itemSum }));
  check("run total equals the ledger (confirmed + charged_uncertain) plus the injected 1.7", near(tot.total_cost_inr, (await ledgerSum(run2)) + 1.7));
  check("no location ever has more than INR 2 charged or in flight", (await q("select count(*)::int n from ai_run_locations where run_id in ($1,$2) and cost_inr + reserved_inr > 2.0001", [run, run2]))[0].n === 0);

  // retry failed, cancel
  const retry = await rpc("public.ai_retry_failed_locations($1)", [run2]);
  check("retry re-queues failed locations that still have budget", retry.pending === 1);
  await rpc("public.ai_pause_run($1)", [run2]);
  await c.query("reset role");
  await c.query("update ai_run_locations set status='failed', cost_inr = 1.9 where run_id=$1 and status='pending'", [run2]);
  await as(ADMIN);
  await expectErr("retry with no budget left is refused", () => q("select public.ai_retry_failed_locations($1)", [run2]), "P0001");
  await rpc("public.ai_cancel_run($1)", [run2]);
  const run3 = await rpc("public.ai_start_run(0)");
  check("after cancel a new run can be started again", !!run3.run_id);
  await rpc("public.ai_cancel_run($1)", [run3.run_id]);

  // ---------------- manual approval path is unchanged ----------------
  await c.query("reset role");
  const pending = (await q("select d.id, h.location_id from ai_field_verification_details d join ai_location_verification_history h on h.id=d.verification_history_id where d.verification_history_id=$1 and d.field_name='entry_fee'", [rec.history_id]))[0];
  check("this run's proposal is still pending (nothing auto-approved)", !!pending && (await q("select review_status from ai_field_verification_details where id=$1", [pending.id]))[0].review_status === "pending");
  check("locations are still untouched after every run, retry, cancel and resume", (await snapshot()) === locationsBefore);
  await as(PUB);
  const approved = await rpc("public.ai_approve_field_proposal($1,$2)", [pending.id, pending.location_id]);
  await c.query("reset role");
  check("only a manual approval changes the location", approved.approved_value === "₹40-test" && (await q("select entry_fee from locations where id=$1", [pending.location_id]))[0].entry_fee === "₹40-test");

  // ---------------- read access ----------------
  await as(PUB);
  check("reviewers can read runs, the queue and the ledger", (await q("select count(*)::int n from ai_run_locations"))[0].n > 0 && (await q("select count(*)::int n from ai_cost_reservations"))[0].n > 0 && (await q("select count(*)::int n from ai_maintenance_runs"))[0].n > 0);
  await as("anon");
  await expectErr("anonymous cannot read the queue or the ledger", () => q("select count(*) from ai_cost_reservations"), "42501");
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
