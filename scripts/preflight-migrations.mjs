// Read-only pre-flight for schema migrations (local or hosted).
//
// WHY THIS EXISTS
// The supported path for a hosted schema change is `supabase db push`, which
// (a) records every applied file in supabase_migrations.schema_migrations and
// (b) refuses to apply migrations out of chronological order. Raw-SQL helpers
// (scripts/run-migration.mjs) record NOTHING, so a migration applied that way
// leaves the database ahead of its own history — after which `supabase db push`
// would try to re-apply it and abort midway.
//
// This script parses EVERY migration file, extracts the objects it creates
// (tables, columns, functions, triggers, policies, indexes), drops objects a
// LATER migration removes/renames, and checks what actually exists in the
// database. Each migration is classified as one of:
//   APPLIED            recorded in history, all objects present
//   NOT APPLIED        not recorded, no objects present (clean pending)
//   UNRECORDED-FULL    not recorded, ALL objects present  -> repair candidate
//   UNRECORDED-PARTIAL not recorded, SOME objects present -> manual decision
//   RECORDED-PARTIAL   recorded, objects missing          -> history is lying
//   RECORDED-MISSING   recorded, no objects present       -> history is lying
//   SUPERSEDED         not recorded, every object later removed/replaced -> manual
//   UNVERIFIABLE       not recorded, no trackable objects (data-only)    -> manual
// Object existence is a heuristic (name-level, not definition-level): UNRECORDED-FULL
// means "every named object exists", not "the definitions are byte-identical".
// Review the definitions before running any repair command.
//
// STRICTLY READ-ONLY: SELECTs only. It never writes history, repairs, or applies SQL.
// Repair is the job of `supabase migration repair --status applied <version>`,
// which this script only prints.
//
// Note: Node's --env-file does not override a DATABASE_URL already present in
// the process environment, so the target host printed below can differ from the
// file you passed. Always read it before trusting the run.
//
// Usage:
//   node --env-file=.env.production-backup scripts/preflight-migrations.mjs
//   node --env-file=.env.local scripts/preflight-migrations.mjs
//
// Exit codes: 0 = safe to run `supabase db push`; 1 = STOP, manual decision required.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// Same pattern/ordering the Supabase CLI uses: version prefix, numeric order.
const MIGRATE_FILE_PATTERN = /^([0-9]+)_(.*)\.sql$/;
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function fail(message) {
  console.error(`\nSTOP: ${message}\n`);
  process.exit(1);
}

// Object kinds: table | column | function | trigger | policy | index.
// Identity strings: "table:x", "column:table.col", "function:x", ...
function analyzeSql(rawSql) {
  const sql = rawSql.replace(/--[^\n]*/g, "");
  const created = new Set();
  const removed = new Set();

  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)) created.add(`table:${m[1]}`);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)) created.add(`function:${m[1]}`);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+(\w+)/gi)) created.add(`trigger:${m[1]}`);
  for (const m of sql.matchAll(/create\s+policy\s+(\w+)/gi)) created.add(`policy:${m[1]}`);
  for (const m of sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(\w+)/gi)) created.add(`index:${m[1]}`);

  for (const m of sql.matchAll(/alter\s+publication\s+(\w+)\s+add\s+table\s+public\.(\w+)/gi)) created.add(`publication:${m[1]}.${m[2]}`);

  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?public\.(\w+)/gi)) removed.add(`table:${m[1]}`);
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)/gi)) removed.add(`function:${m[1]}`);
  for (const m of sql.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)/gi)) removed.add(`trigger:${m[1]}`);
  for (const m of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?(\w+)/gi)) removed.add(`policy:${m[1]}`);
  for (const m of sql.matchAll(/drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) removed.add(`index:${m[1]}`);

  for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?public\.(\w+)\s+([\s\S]*?);/gi)) {
    const [, table, body] = m;
    for (const c of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) created.add(`column:${table}.${c[1]}`);
    for (const c of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi)) removed.add(`column:${table}.${c[1]}`);
    for (const c of body.matchAll(/rename\s+column\s+(\w+)\s+to\s+(\w+)/gi)) {
      removed.add(`column:${table}.${c[1]}`);
      created.add(`column:${table}.${c[2]}`);
    }
  }

  return { created, removed };
}

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not set. Pass it via --env-file=<file> (never commit that file).");
}

const databaseUrl = process.env.DATABASE_URL;
const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);

// Host + port only — never the username, password, or full connection string.
let target = "(unparseable DATABASE_URL)";
try {
  const url = new URL(databaseUrl);
  target = `${url.hostname}:${url.port || "5432"}/${url.pathname.replace(/^\//, "")}`;
} catch {
  /* keep the placeholder above */
}

const localMigrations = readdirSync(MIGRATIONS_DIR)
  .map((name) => {
    const match = MIGRATE_FILE_PATTERN.exec(name);
    return match ? { version: match[1], name } : null;
  })
  .filter(Boolean)
  .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));

if (localMigrations.length === 0) {
  fail(`No migration files found in ${MIGRATIONS_DIR}.`);
}

for (const migration of localMigrations) {
  migration.analysis = analyzeSql(readFileSync(join(MIGRATIONS_DIR, migration.name), "utf8"));
}

// An object created by version V is superseded if any later migration removes it.
function isSuperseded(migration, identity) {
  return localMigrations.some((later) => later.version > migration.version && later.analysis.removed.has(identity));
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

console.log(`Target: ${target}${isLocal ? " (local)" : "  <-- NON-LOCAL"}`);
console.log(`Local migrations: ${localMigrations.length}`);

async function exists(identity) {
  const [kind, name] = identity.split(":");
  const one = async (text, params) => (await client.query(text, params)).rows[0].present === true;
  switch (kind) {
    case "table":
    case "index":
      return one("select to_regclass($1) is not null as present", [`public.${name}`]);
    case "function":
      return one(
        "select exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1) as present",
        [name],
      );
    case "trigger":
      return one("select exists(select 1 from pg_trigger where not tgisinternal and tgname = $1) as present", [name]);
    case "policy":
      return one("select exists(select 1 from pg_policies where schemaname = 'public' and policyname = $1) as present", [name]);
    case "publication": {
      const [pubname, table] = name.split(".");
      return one(
        "select exists(select 1 from pg_publication_tables where pubname = $1 and schemaname = 'public' and tablename = $2) as present",
        [pubname, table],
      );
    }
    case "column": {
      const [table, column] = name.split(".");
      return one(
        "select exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2) as present",
        [table, column],
      );
    }
    default:
      throw new Error(`Unknown object kind: ${kind}`);
  }
}

let applied = [];
let historyExists = true;
const report = [];

try {
  try {
    await client.connect();
  } catch (error) {
    fail(`Could not connect to ${target}: ${error.code ?? error.message}`);
  }

  const { rows: historyRows } = await client.query(
    "select to_regclass('supabase_migrations.schema_migrations') is not null as present",
  );
  historyExists = historyRows[0]?.present === true;

  if (historyExists) {
    const { rows } = await client.query("select version from supabase_migrations.schema_migrations order by version");
    applied = rows.map((row) => String(row.version));
  }

  // 1. Drift: history references a version with no local file.
  const localVersions = new Set(localMigrations.map((m) => m.version));
  const remoteOnly = applied.filter((version) => !localVersions.has(version));
  if (remoteOnly.length > 0) {
    fail(
      `Migration history contains versions with no matching local file:\n  ${remoteOnly.join("\n  ")}\n` +
        "This is drift: the repo does not describe the database. Do not push.\n" +
        "Reconcile first (pull the missing files, or inspect with `supabase migration list --linked`).",
    );
  }

  // 2. Per-migration object verification (every file, not a hardcoded subset).
  const appliedSet = new Set(applied);
  for (const migration of localMigrations) {
    const expected = [...migration.analysis.created].filter((identity) => !isSuperseded(migration, identity));
    const present = [];
    const missing = [];
    for (const identity of expected) (await exists(identity) ? present : missing).push(identity);

    const recorded = appliedSet.has(migration.version);
    let status;
    if (recorded && expected.length === 0) status = "APPLIED";
    else if (migration.analysis.created.size === 0) status = "UNVERIFIABLE";
    else if (expected.length === 0) status = "SUPERSEDED";
    else if (missing.length === 0) status = recorded ? "APPLIED" : "UNRECORDED-FULL";
    else if (present.length === 0) status = recorded ? "RECORDED-MISSING" : "NOT APPLIED";
    else status = recorded ? "RECORDED-PARTIAL" : "UNRECORDED-PARTIAL";

    report.push({ ...migration, recorded, status, expected, present, missing });
  }
} finally {
  await client.end();
}

// 3. Ordering: a pending migration older than what is already applied.
const highestApplied = applied.length > 0 ? applied[applied.length - 1] : null;
const pending = report.filter((r) => !r.recorded);
const outOfOrder = highestApplied ? pending.filter((r) => r.version < highestApplied) : [];

console.log(historyExists ? `Applied versions in history: ${applied.length}` : "No supabase_migrations.schema_migrations table yet.");

const byStatus = (status) => report.filter((r) => r.status === status);
const unrecordedFull = byStatus("UNRECORDED-FULL");
const unrecordedPartial = byStatus("UNRECORDED-PARTIAL");
const recordedBad = report.filter((r) => r.status === "RECORDED-PARTIAL" || r.status === "RECORDED-MISSING");
const cleanPending = byStatus("NOT APPLIED");

console.log(
  `\nSummary: ${byStatus("APPLIED").length} applied | ${unrecordedFull.length} unrecorded-full | ` +
    `${unrecordedPartial.length} unrecorded-partial | ${recordedBad.length} recorded-but-wrong | ${cleanPending.length} clean pending`,
);

function printGroup(title, rows, showObjects) {
  if (rows.length === 0) return;
  console.log(`\n${title}`);
  for (const r of rows) {
    console.log(`  ${r.name}  [${r.present.length}/${r.expected.length} objects present]`);
    if (showObjects && r.missing.length > 0) console.log(`      missing: ${r.missing.join(", ")}`);
    if (showObjects && r.present.length > 0 && r.missing.length > 0) console.log(`      present: ${r.present.join(", ")}`);
  }
}

const undecidable = report.filter((r) => r.status === "SUPERSEDED" || r.status === "UNVERIFIABLE");
if (undecidable.length > 0) {
  console.log(
    "\nCANNOT VERIFY from object names (every object was later removed/replaced, or the file has no trackable objects).\n" +
      "Inspect each file by hand; do NOT repair or push until you have decided:",
  );
  for (const r of undecidable) console.log(`  ${r.name}  [${r.status}]`);
}

printGroup("UNRECORDED-PARTIAL (some objects exist, some missing — manual decision):", unrecordedPartial, true);
printGroup("RECORDED but database disagrees (history is inaccurate):", recordedBad, true);
printGroup("UNRECORDED-FULL (every named object exists; history never recorded it):", unrecordedFull, false);

if (outOfOrder.length > 0) {
  console.log(`\nOut-of-order pending (older than highest applied ${highestApplied}):`);
  for (const r of outOfOrder) console.log(`  ${r.name}`);
}

if (recordedBad.length > 0 || unrecordedPartial.length > 0 || undecidable.length > 0) {
  fail("Partial, contradictory, or unverifiable migration state found (see above). Do not push or repair until each is understood.");
}

if (unrecordedFull.length > 0) {
  console.error(
    "\nSTOP: objects exist but their migration versions are NOT in history.\n" +
      "Pushing would re-run these files. After you have compared each file's DEFINITIONS to the live schema\n" +
      "(name-level existence is not proof), record reality with the supported command, one per version:\n  " +
      unrecordedFull.map((r) => `npx supabase migration repair --status applied ${r.version} --linked`).join("\n  ") +
      "\nThen re-run this pre-flight.\n",
  );
  process.exit(1);
}

if (outOfOrder.length > 0) {
  fail(
    "Pending migrations are older than the highest applied version. Do not push.\n" +
      "If deliberate this must be an explicit human decision, never a default.",
  );
}

if (cleanPending.length === 0) {
  console.log("\nOK: no pending migrations. Nothing to push.");
  process.exit(0);
}

console.log(`\nPending migrations, in the order they would be applied (${cleanPending.length}):`);
for (const r of cleanPending) console.log(`  ${r.name}`);
console.log(
  "\nPre-flight passed. Apply them with the history-recording CLI path:\n" +
    "  npx supabase db push --linked --dry-run   # verify the plan\n" +
    "  npx supabase db push --linked             # apply (records schema_migrations)\n" +
    "Do NOT use --include-all or --include-seed for a normal deployment.\n" +
    "Back up / confirm PITR first.",
);
process.exit(0);
