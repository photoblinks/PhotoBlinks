// LOCAL-ONLY helper: applies a SQL file directly against the database.
// Requires DATABASE_URL (direct connection, not the pooler) — only needed for
// schema changes, never at runtime.
//
// IMPORTANT: this script does NOT record anything in
// supabase_migrations.schema_migrations. Applying a *migration* with it leaves
// the local files and the migration history out of sync, after which
// `supabase db push` tries to re-apply already-applied files and aborts.
//
// Use the CLI path for migrations instead:
//   node --env-file=.env.production-backup scripts/preflight-migrations.mjs
//   npx supabase db push --linked --dry-run
//   npx supabase db push --linked
//
// Running it against a NON-LOCAL database is therefore refused unless the
// operator explicitly opts in with --allow-remote (the script then prints the
// `supabase migration repair` commands that must follow, since history was not
// written). Non-local targets are for genuine one-off SQL, not for migrations.
//
// Usage: node --env-file=.env.local scripts/run-migration.mjs <path-to-sql-file> [--allow-remote]
import { readFileSync } from "node:fs";
import { Client } from "pg";

const args = process.argv.slice(2).filter((arg) => arg !== "--allow-remote");
const allowRemote = process.argv.includes("--allow-remote");
const filePath = args[0];
if (!filePath) {
  console.error(
    "Usage: node --env-file=.env.local scripts/run-migration.mjs <path-to-sql-file> [--allow-remote]",
  );
  process.exit(1);
}

const sql = readFileSync(filePath, "utf8");

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

// Host + port only — never the username, password, or full connection string.
let target = "(unparseable DATABASE_URL)";
try {
  const url = new URL(process.env.DATABASE_URL);
  target = `${url.hostname}:${url.port || "5432"}/${url.pathname.replace(/^\//, "")}`;
} catch {
  /* keep the placeholder above */
}

if (!isLocal && !allowRemote) {
  console.error(
    `\nREFUSED: DATABASE_URL targets ${target}, which is not local.\n\n` +
      "This helper does not write migration history, so it must not be used for a\n" +
      "schema migration on a hosted database. Use the supported CLI path instead:\n" +
      "  node --env-file=.env.production-backup scripts/preflight-migrations.mjs\n" +
      "  npx supabase db push --linked --dry-run\n" +
      "  npx supabase db push --linked\n\n" +
      "If this is genuinely a one-off SQL statement (not a migration), re-run with\n" +
      "  --allow-remote\n" +
      "and afterwards record reality with the supported command:\n" +
      "  npx supabase migration repair --status applied <version> --linked\n",
  );
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

console.log(`Target: ${target}${isLocal ? " (local)" : "  <-- NON-LOCAL"}`);

await client.connect();
try {
  await client.query(sql);
  console.log(`Applied ${filePath} successfully.`);
  if (!isLocal) {
    console.warn(
      "\nWARNING: no migration-history record was written for this run.\n" +
        "If this file is a migration, record reality with the supported command:\n" +
        "  npx supabase migration repair --status applied <version> --linked",
    );
  }
} finally {
  await client.end();
}

