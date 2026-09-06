-- Phase 19B: moderated public comments on locations. Every new comment
-- starts 'pending' and is invisible publicly until an admin approves it —
-- this is a simple moderation queue, not a rating/review system. Purely
-- additive: does not touch locations, favourites, or any other table.

create table public.location_comments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  comment text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index location_comments_location_id_idx on public.location_comments (location_id);
create index location_comments_location_status_idx on public.location_comments (location_id, status);
create index location_comments_status_idx on public.location_comments (status);
create index location_comments_user_id_idx on public.location_comments (user_id);

create trigger location_comments_set_updated_at
  before update on public.location_comments
  for each row execute function public.set_updated_at();

alter table public.location_comments enable row level security;

-- Public read: approved comments only, on any (even unpublished-later)
-- location — pending/rejected rows are never selectable by anon/authenticated
-- through this policy, only through admin_all below.
create policy location_comments_public_read on public.location_comments
  for select using (status = 'approved');

-- A signed-in user may insert a comment only as themselves, only in the
-- 'pending' state, and only against a real, currently-published location.
-- This is the actual enforcement behind "no forged user_id" and "no
-- forged status=approved" — a client can't override any of these by
-- sending a different value, since the WITH CHECK simply rejects the row.
create policy location_comments_insert_own on public.location_comments
  for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and exists (select 1 from public.locations l where l.id = location_id and l.is_published = true)
  );

-- Admins moderate through the same is_admin() mechanism as every other
-- admin-only table — no separate role system. Covers select (all
-- statuses)/update (approve/reject)/delete.
create policy location_comments_admin_all on public.location_comments
  for all using (public.is_admin()) with check (public.is_admin());

-- Public-facing author name: no email, user id, or profile system exposed.
-- auth.users isn't reachable through PostgREST/RLS at all (it's outside
-- the exposed public/graphql_public schemas), so any comment listing needs
-- a narrow function like this one to resolve a display name at all. Prefers
-- the real name Google OAuth already populates in user_metadata for Google
-- sign-ins; falls back to a masked email-prefix for plain email/password
-- accounts, which have no such metadata.
create function public.get_approved_location_comments(
  p_location_id uuid,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  comment text,
  created_at timestamptz,
  author_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    lc.id,
    lc.comment,
    lc.created_at,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      left(split_part(u.email, '@', 1), 2) || '***'
    ) as author_name
  from public.location_comments lc
  join auth.users u on u.id = lc.user_id
  where lc.location_id = p_location_id
    and lc.status = 'approved'
  order by lc.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_approved_location_comments(uuid, int, int) to anon, authenticated;

-- Admin moderation listing: every status, across every location, with the
-- same safe author-name resolution plus the location's own name/slug so
-- admins can tell exactly where a comment belongs and link to the public
-- page. SECURITY DEFINER only to reach auth.users (same reason as above) —
-- self-guarded with an explicit is_admin() check since a definer function
-- bypasses RLS internally and must not become a non-admin's back door into
-- pending/rejected comments.
create function public.get_admin_location_comments(p_status text default null)
returns table (
  id uuid,
  location_id uuid,
  location_name text,
  location_slug text,
  author_name text,
  comment text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    lc.id,
    lc.location_id,
    l.name,
    l.slug,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      left(split_part(u.email, '@', 1), 2) || '***'
    ),
    lc.comment,
    lc.status,
    lc.created_at
  from public.location_comments lc
  join public.locations l on l.id = lc.location_id
  join auth.users u on u.id = lc.user_id
  where p_status is null or lc.status = p_status
  order by lc.created_at desc;
end;
$$;

grant execute on function public.get_admin_location_comments(text) to authenticated;
