-- F1 (SEO audit): redirect & slug stability for locations/studios.
--
-- The blog system already refuses to change a published post's slug
-- (20260911020000_blog_posts_lock_published_slug.sql) — a hard block, no
-- redirect, because a blog slug change was never a supported workflow.
-- Locations/studios are different: the existing admin edit forms already
-- let an admin change a published location/studio's slug (see
-- parseLocationForm/parseStudioForm in src/app/admin/(shell)/locations|
-- studios/actions.ts), and that's a legitimate workflow we must keep
-- working. So instead of blocking the change, the database becomes the
-- final, unconditional place that records a permanent redirect from the
-- old public URL whenever a published location/studio's slug changes or
-- the entity is deleted — an app-level "insert a redirect row" step would
-- be racy and skippable exactly like the app-level slug check blog used
-- to have, and wouldn't cover a future direct DB write either.
--
-- Reading these tables is public (the proxy/middleware layer looks up a
-- requested /location/:slug or /studio/:slug against them to issue a real
-- HTTP 301 before the page ever renders — see src/proxy.ts), but nothing
-- except the trigger functions below (security definer, so they run as
-- the migration owner and bypass RLS like public.is_admin() does) ever
-- writes to them.

create table public.location_slug_redirects (
  old_slug text primary key,
  redirect_to text not null,
  created_at timestamptz not null default now()
);

create index location_slug_redirects_redirect_to_idx
  on public.location_slug_redirects (redirect_to);

create table public.studio_slug_redirects (
  old_slug text primary key,
  redirect_to text not null,
  created_at timestamptz not null default now()
);

create index studio_slug_redirects_redirect_to_idx
  on public.studio_slug_redirects (redirect_to);

alter table public.location_slug_redirects enable row level security;
create policy location_slug_redirects_public_read on public.location_slug_redirects
  for select using (true);
create policy location_slug_redirects_admin_all on public.location_slug_redirects
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.studio_slug_redirects enable row level security;
create policy studio_slug_redirects_public_read on public.studio_slug_redirects
  for select using (true);
create policy studio_slug_redirects_admin_all on public.studio_slug_redirects
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------

create function public.locations_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dest text;
begin
  -- A slug that belongs to a live row must never be shadowed by a stale
  -- redirect entry (e.g. a slug freed by a rename/delete gets reused by a
  -- new or renamed row) — otherwise that row's own URL would loop back to
  -- whatever the old redirect pointed at instead of rendering.
  if tg_op in ('INSERT', 'UPDATE') then
    delete from public.location_slug_redirects where old_slug = new.slug;
  end if;

  if tg_op = 'UPDATE' and old.is_published and new.slug is distinct from old.slug then
    dest := '/location/' || new.slug;

    insert into public.location_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    -- Collapse any redirect that pointed at the slug being replaced so
    -- chained renames still resolve in a single hop (no redirect loops).
    update public.location_slug_redirects
    set redirect_to = dest
    where redirect_to = '/location/' || old.slug;
  end if;

  if tg_op = 'DELETE' and old.is_published then
    select '/locations/' || c.slug || '/' || s.slug || '/' || ci.slug
    into dest
    from public.countries c
    join public.states s on s.id = old.state_id
    join public.cities ci on ci.id = old.city_id
    where c.id = old.country_id;

    insert into public.location_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    update public.location_slug_redirects
    set redirect_to = dest
    where redirect_to = '/location/' || old.slug;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger locations_slug_redirects
  before insert or update or delete on public.locations
  for each row execute function public.locations_slug_redirects();

-- ---------------------------------------------------------------------------
-- studios
-- ---------------------------------------------------------------------------

create function public.studios_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dest text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    delete from public.studio_slug_redirects where old_slug = new.slug;
  end if;

  if tg_op = 'UPDATE' and old.is_published and new.slug is distinct from old.slug then
    dest := '/studio/' || new.slug;

    insert into public.studio_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    update public.studio_slug_redirects
    set redirect_to = dest
    where redirect_to = '/studio/' || old.slug;
  end if;

  if tg_op = 'DELETE' and old.is_published then
    select '/studios/' || c.slug || '/' || s.slug || '/' || ci.slug
    into dest
    from public.countries c
    join public.states s on s.id = old.state_id
    join public.cities ci on ci.id = old.city_id
    where c.id = old.country_id;

    insert into public.studio_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    update public.studio_slug_redirects
    set redirect_to = dest
    where redirect_to = '/studio/' || old.slug;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger studios_slug_redirects
  before insert or update or delete on public.studios
  for each row execute function public.studios_slug_redirects();
