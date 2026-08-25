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

`.env.production-backup` (gitignored) holds the hosted Supabase project's credentials. To apply a new migration there too:

```
node --env-file=.env.production-backup scripts/run-migration.mjs supabase/migrations/<file>.sql
```

R2 and Mapbox are shared, real, external services in both environments — there's no local/mock version of them.

## Project structure

- `src/lib/supabase/client.ts` — browser Supabase client (public pages, RLS as anon)
- `src/lib/supabase/server.ts` — server Supabase client for Server Components/Actions (RLS as the signed-in admin)
- `src/lib/supabase/admin.ts` — service-role client, server-only, reserved for bootstrap tasks
- `src/lib/r2/` — Cloudflare R2 presigned-upload helpers
- `src/proxy.ts` — refreshes the Supabase session per request and gates `/admin/*` behind login
- `supabase/migrations/` — SQL schema (categories, states, cities, locations, studios, RLS policies)
