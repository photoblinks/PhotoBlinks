// Behaviour test for supabase/migrations/20261125000000_ai_location_verification.sql.
//
//   node scripts/test-ai-verification-migration.mjs <postgres-url-of-a-SCRATCH-db-with-the-migration-applied>
//
// Everything runs in one transaction that is rolled back. Refuses any non-local
// host. Needs >=1 published location, and uses fixed test user ids that it seeds
// itself (auth.users / admins / employees rows are rolled back too).
import pg from "pg";

const url = process.argv[2];
if (!url) throw new Error("usage: node scripts/test-ai-verification-migration.mjs <postgres-url>");
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`refusing non-local host ${host}`);

const ADMIN = "0907731a-94e6-4303-bf6e-bad04d6ec5a1";
const PUB = "dad06cc4-52af-4ce9-8f35-77a10039cc0b";
const NONE = "d1d51c91-81bc-4684-8f74-bde8e01dd382";

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
// Runs fn in a savepoint; returns { value } or { code, message }.
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
  check(name, r.code === code && (!msgPart || r.message.includes(msgPart)), `got ${r.code}: ${r.message ?? JSON.stringify(r.value)}`);
};

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

  const [l0, l1] = await q("select * from locations order by name limit 2");
  const L = l0.id;
  const mk = async (runDate) => {
    const r = (await q("insert into ai_maintenance_runs(run_date,status,started_at,locked_by,lease_token,lease_expires_at,heartbeat_at) values ($1,'running',now(),'t',gen_random_uuid(),now()+interval '1h',now()) returning id", [runDate]))[0].id;
    const h = (await q("insert into ai_location_verification_history(location_id,run_id,result,confidence,summary,model,is_latest) values ($1,$2,'changes_found',0.9,'s','m',true) returning id", [L, r]))[0].id;
    return { r, h };
  };
  const A = await mk("2026-11-19");
  const B = await mk("2026-11-19");
  check("same-day runs both kept", (await q("select count(*)::int n from ai_maintenance_runs where run_date='2026-11-19'"))[0].n === 2);
  check("exactly one is_latest per location", (await q("select count(*)::int n from ai_location_verification_history where location_id=$1 and is_latest", [L]))[0].n === 1);

  const ins = async (f, cur, prop, vs, h = B.h) =>
    (await q("insert into ai_field_verification_details(verification_history_id,field_name,current_value,proposed_value,verification_status,grounded_evidence,source_urls,confidence) values ($1,$2,$3,$4,$5,'ev','{https://a.example}',0.9) returning id", [h, f, cur, prop, vs]))[0].id;
  const dOK = await ins("pre_wedding_shoot", l0.pre_wedding_shoot, "conditional", "verified");
  const dUnv = await ins("drone_status", l0.drone_status, "unknown", "unverified");
  const dStale = await ins("prior_booking", "STALEBASE", "yes", "verified");
  const dBadEnum = await ins("drone_status", l0.drone_status, "bogus", "verified", A.h);
  const dRej = await ins("shoot_permit_fee", l0.shoot_permit_fee, "500", "verified");

  // --- reads ---
  const counts = async (u) => {
    await as(u);
    const r = await attempt(async () => (await q("select (select count(*) from ai_field_verification_details)::int d, (select count(*) from ai_location_verification_history)::int h, (select count(*) from ai_maintenance_runs)::int r"))[0]);
    await as(null);
    return r;
  };
  for (const [n, u] of [["admin", ADMIN], ["publish-only employee", PUB]]) {
    const r = await counts(u);
    check(`${n} can read proposals/history/runs`, r.value && r.value.d >= 5 && r.value.h >= 2 && r.value.r >= 2, JSON.stringify(r));
  }
  const none = await counts(NONE);
  check("employee without permission reads 0 rows", none.value && none.value.d === 0 && none.value.h === 0 && none.value.r === 0, JSON.stringify(none));
  await as("anon");
  await expectErr("anon cannot read", () => q("select count(*) from ai_field_verification_details"), "42501");

  // --- approve (error codes drive the UI message mapping in actions.ts) ---
  await as(PUB);
  const ok = await attempt(async () => {
    const r = (await q("select ai_approve_field_proposal($1,$2) r", [dOK, L]))[0].r;
    await as(null);
    const loc = (await q("select * from locations where id=$1", [L]))[0];
    return { r, loc };
  });
  check("publish-only employee approves; only that column changes",
    ok.value && ok.value.r.field === "pre_wedding_shoot" && ok.value.loc.pre_wedding_shoot === "conditional" &&
    ["drone_status", "entry_fee", "prior_booking", "drone_permission", "shoot_permit_fee"].every((k) => ok.value.loc[k] === l0[k]),
    JSON.stringify(ok));
  await as(PUB);
  await expectErr("unverified field -> P0001 (safe message)", () => q("select ai_approve_field_proposal($1,$2)", [dUnv, L]), "P0001", "unverified field");
  await expectErr("stale proposal -> P0001", () => q("select ai_approve_field_proposal($1,$2)", [dStale, L]), "P0001", "modified since");
  await expectErr("wrong location -> P0001", () => q("select ai_approve_field_proposal($1,$2)", [dOK, l1.id]), "P0001", "mismatch");
  await expectErr("already approved -> P0001", async () => { await q("select ai_approve_field_proposal($1,$2)", [dOK, L]); return q("select ai_approve_field_proposal($1,$2)", [dOK, L]); }, "P0001", "already approved");
  await expectErr("invalid enum value -> 23514 (mapped to generic message)", () => q("select ai_approve_field_proposal($1,$2)", [dBadEnum, L]), "23514");
  await as(NONE);
  await expectErr("no-permission employee cannot approve -> 42501", () => q("select ai_approve_field_proposal($1,$2)", [dOK, L]), "42501");
  await as("anon");
  await expectErr("anon cannot execute approve", () => q("select ai_approve_field_proposal($1,$2)", [dOK, L]), "42501");

  // --- reject / tamper ---
  await as(PUB);
  const rej = await attempt(async () => {
    const n = (await c.query("update ai_field_verification_details set review_status='rejected',reviewed_by=$2,reviewed_at=now() where id=$1", [dRej, PUB])).rowCount;
    await as(null);
    return { n, fee: (await q("select shoot_permit_fee from locations where id=$1", [L]))[0].shoot_permit_fee };
  });
  check("reject updates review row, leaves location unchanged", rej.value && rej.value.n === 1 && rej.value.fee === l0.shoot_permit_fee, JSON.stringify(rej));
  await as(PUB);
  await expectErr("reviewer cannot edit proposed_value", () => c.query("update ai_field_verification_details set proposed_value='x' where id=$1", [dRej]), "42501");
  await expectErr("reviewer cannot insert", () => c.query("insert into ai_field_verification_details(verification_history_id,field_name,proposed_value,verification_status) values ($1,'entry_fee','1','verified')", [B.h]), "42501");
  await expectErr("reviewer cannot delete", () => c.query("delete from ai_field_verification_details where id=$1", [dRej]), "42501");
  await expectErr("publish-only still cannot edit location content directly", () => c.query("update locations set drone_status='allowed' where id=$1", [L]), "42501", "permission");

  // service-role (PostgREST with the service key: no user, role claim service_role) keeps its trusted write access
  const svc = await attempt(async () => {
    await c.query("reset role");
    await c.query("set local role service_role");
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: "service_role" })]);
    return (await c.query("update locations set drone_status='allowed' where id=$1", [L])).rowCount;
  });
  check("service-role session can still update location content (trusted context unchanged)", svc.value === 1, JSON.stringify(svc));
  await as(PUB);

  // --- audit trail + FK behaviour ---
  await as(null);
  await expectErr("history is append-only", () => q("update ai_location_verification_history set result='failed' where id=$1", [A.h]), "P0001", "append-only");
  await expectErr("history row delete blocked", () => q("delete from ai_location_verification_history where id=$1", [A.h]), "P0001", "audit history");
  await expectErr("history truncate blocked", () => q("truncate ai_location_verification_history"), "0A000");
  await expectErr("is_latest cannot be re-promoted", () => q("update ai_location_verification_history set is_latest=true where id=$1", [A.h]), "P0001", "re-promoted");
  await expectErr("location with AI history cannot be deleted (RESTRICT -> 23503)", () => q("delete from locations where id=$1", [L]), "23503");
  const plain = await attempt(async () => {
    const id = (await q("insert into locations(name,slug,city_id,category_id,state_id,country_id) select 'zz','zz-tmp',city_id,category_id,state_id,country_id from locations limit 1 returning id"))[0].id;
    return (await c.query("delete from locations where id=$1", [id])).rowCount;
  });
  check("location without AI history deletes normally", plain.value === 1, JSON.stringify(plain));

  // --- activity log ---
  for (const a of ["ai_approved", "ai_rejected"]) {
    const r = await attempt(() => q("insert into activity_events(user_id,module,action,entity_id) values ($1,'locations',$2,gen_random_uuid()) returning id", [ADMIN, a]));
    check(`activity_events accepts ${a}`, !!r.value, JSON.stringify(r));
  }
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
