# PhotoBlinks

Photoshoot-location discovery platform for Karnataka and Kerala, India. See [CLAUDE.md](./CLAUDE.md) for scope and rules.

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Supabase (DB/Auth), Cloudflare R2 (images), Mapbox (maps).

## Local development (Docker)

Development runs against a local Supabase stack (Postgres/Auth/Storage in Docker), not the hosted project, so nothing touches production data day-to-day.

1. Docker Desktop must be running.
2. `npm install`
3. `npm run db:start` — starts the local stack and applies everything in `supabase/migrations/` (first run pulls images, slower). Prints local API URL + anon/service_role keys — `.env.local` is already wired to the default local keys, only re-copy them if `db:start` ever prints different ones.
4. `npm run dev` — [http://localhost:3000](http://localhost:3000)

New migration → `npm run db:reset` (rebuilds the local DB from scratch off every file in `supabase/migrations/`, so it also catches ordering mistakes). `npm run db:stop` shuts the containers down.

### Pushing schema to production

`.env.production-backup` (gitignored) holds the hosted Supabase project's credentials. The repo is linked to the hosted project (`supabase/.temp/project-ref`, gitignored), so migrations go through the Supabase CLI, which **records each applied file in `supabase_migrations.schema_migrations`** and **refuses to apply migrations out of chronological order** (it aborts on the first error, per file, transactionally):

```
npm run db:preflight    # read-only: drift / ordering / partial-state checks
npx supabase db push --linked --dry-run   # verify the plan (no changes)
npm run db:push         # apply; records schema_migrations
```

`npm run db:preflight` (→ `scripts/preflight-migrations.mjs`) prints the target host and stops with exit code 1 on: history/code drift, a pending migration older than the highest applied version, or an object that exists while its version is absent from history. It is strictly read-only — it never writes history and never applies SQL.

Rules for this path:

- **Never** pass `--include-all` (applies out-of-order migrations) or `--include-seed` (would push `supabase/seed.sql`) unless that is a deliberate, reviewed decision.
- If a migration was ever applied manually (see below), record reality first with the supported command, then push:
  `npx supabase migration repair --status applied <version> --linked`
- `--linked` needs the hosted DB password: set `SUPABASE_DB_PASSWORD` or let the CLI prompt. It is never stored in the repo.

`scripts/run-migration.mjs` still exists for **local, one-off SQL**. It applies raw SQL and writes **no** migration history, so using it for a migration desynchronises the files from `schema_migrations` and makes the next `db push` fail on already-applied objects. It now **refuses a non-local `DATABASE_URL`** unless `--allow-remote` is passed explicitly, and prints the `supabase migration repair` commands that must follow when it is.

R2 and Mapbox are shared, real, external services in both environments — there's no local/mock version of them.

## Project structure

- `src/lib/supabase/client.ts` — browser Supabase client (public pages, RLS as anon)
- `src/lib/supabase/server.ts` — server Supabase client for Server Components/Actions (RLS as the signed-in admin)
- `src/lib/supabase/admin.ts` — service-role client, server-only, reserved for bootstrap tasks
- `src/lib/r2/` — Cloudflare R2 presigned-upload helpers
- `src/proxy.ts` — refreshes the Supabase session per request and gates `/admin/*` behind login
- `supabase/migrations/` — SQL schema (categories, states, cities, locations, studios, RLS policies)
