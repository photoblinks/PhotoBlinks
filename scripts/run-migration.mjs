// One-off / repeatable helper: applies a SQL migration file directly against
// the Supabase Postgres database. Requires DATABASE_URL (direct connection,
// not the pooler) in .env.local — only needed for schema changes, never at
// runtime.
//
// Usage: node --env-file=.env.local scripts/run-migration.mjs <path-to-sql-file>
import { readFileSync } from "node:fs";
import { Client } from "pg";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node --env-file=.env.local scripts/run-migration.mjs <path-to-sql-file>");
  process.exit(1);
}

const sql = readFileSync(filePath, "utf8");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log(`Applied ${filePath} successfully.`);
} finally {
  await client.end();
}
