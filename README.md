# PhotoBlinks

Photoshoot-location discovery platform for Karnataka and Kerala, India. See [CLAUDE.md](./CLAUDE.md) for scope and rules.

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Supabase (DB/Auth), Cloudflare R2 (images), Mapbox (maps).

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in Supabase, R2, and Mapbox credentials.
2. Run the schema in `supabase/migrations/20260825000000_init_schema.sql` against your Supabase project (SQL Editor, or `supabase db push` if using the Supabase CLI).
3. `npm install`
4. `npm run dev` — [http://localhost:3000](http://localhost:3000)

## Project structure

- `src/lib/supabase/client.ts` — browser Supabase client (public pages, RLS as anon)
- `src/lib/supabase/server.ts` — server Supabase client for Server Components/Actions (RLS as the signed-in admin)
- `src/lib/supabase/admin.ts` — service-role client, server-only, reserved for bootstrap tasks
- `src/lib/r2/` — Cloudflare R2 presigned-upload helpers
- `src/proxy.ts` — refreshes the Supabase session per request and gates `/admin/*` behind login
- `supabase/migrations/` — SQL schema (categories, states, cities, locations, studios, RLS policies)
