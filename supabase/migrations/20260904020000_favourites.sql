-- Phase 18: user accounts, favourites, and shared favourite collections.
-- Public user accounts use the SAME Supabase Auth user pool as admins —
-- an account only becomes an admin by having a row in public.admins
-- (is_admin()). Signing up here never grants admin access. Purely
-- additive: no existing table is altered.

-- ---------------------------------------------------------------------------
-- Favourites: user -> location. A user can favourite a published location
-- at most once (UNIQUE(user_id, location_id), enforced at the DB level, not
-- just in the UI). Cascades on either side are deleted along with their
-- parent, same convention as location_images -> locations and
-- admins -> auth.users.
-- ---------------------------------------------------------------------------

create table public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, location_id)
);

create index favourites_user_id_idx on public.favourites (user_id);
create index favourites_location_id_idx on public.favourites (location_id);

alter table public.favourites enable row level security;

-- Private by design: a user can only ever see/insert/delete their OWN
-- favourites. No admin_all policy — admins do not get a back door into
-- users' private favourites through the normal client (see require-admin.ts
-- for how admin access is separately gated for the tables that need it).
create policy favourites_select_own on public.favourites
  for select using (auth.uid() = user_id);
create policy favourites_insert_own on public.favourites
  for insert with check (auth.uid() = user_id);
create policy favourites_delete_own on public.favourites
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Share collections: one stable share link per user (UNIQUE(user_id), so
-- "Share Favourites" is a get-or-create — the same URL is returned on every
-- click until the owner explicitly revokes/regenerates it). `token` is a
-- cryptographically random, unguessable identifier generated server-side
-- (32 random bytes, base64url-encoded — see actions.ts), never a user id,
-- email, or sequential id. `revoked_at` marks a stopped share; a regenerate
-- overwrites `token` and clears `revoked_at` on the same row.
-- ---------------------------------------------------------------------------

create table public.share_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.share_collections enable row level security;

-- Owner-only. There is deliberately NO public/anon select policy here: RLS
-- alone (e.g. "revoked_at is null") cannot stop PostgREST from letting an
-- anon caller list/enumerate every active share row's token/user_id — RLS
-- filters rows, it doesn't require the caller to already know a specific
-- token. Public resolution instead goes exclusively through the
-- SECURITY DEFINER function below, which requires an exact token match and
-- returns only published location ids, never user_id/email/any account data.
create policy share_collections_select_own on public.share_collections
  for select using (auth.uid() = user_id);
create policy share_collections_insert_own on public.share_collections
  for insert with check (auth.uid() = user_id);
create policy share_collections_update_own on public.share_collections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The one narrow, safe public entry point into someone else's favourites:
-- given an exact (active) share token, return the ids of that owner's
-- currently-published favourited locations. Nothing else about the owner
-- (id, email, other favourites, revoked history) is ever returned.
create function public.get_shared_favourite_location_ids(p_token text)
returns table (location_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select f.location_id
  from public.share_collections sc
  join public.favourites f on f.user_id = sc.user_id
  join public.locations l on l.id = f.location_id
  where sc.token = p_token
    and sc.revoked_at is null
    and l.is_published = true;
$$;

grant execute on function public.get_shared_favourite_location_ids(text) to anon, authenticated;
