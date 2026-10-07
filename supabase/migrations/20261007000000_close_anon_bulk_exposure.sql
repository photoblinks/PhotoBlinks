-- Phase 1: close direct bulk data exposure through PostgREST.
--
-- The public website reads published/active data server-side; this
-- migration removes the anon role's ability to read/write that data
-- directly through the Supabase REST API, so an unauthenticated scraper can
-- no longer reconstruct the published database in 1-2 requests. Public
-- pages, SEO, sitemap, llms.txt and llms-full.txt are unaffected: they all
-- render server-side through the service role (src/lib/supabase/public.ts)
-- and the authenticated role keeps its existing grants.
--
-- Reversible: re-apply the original grants from
-- 20260825010000_grants.sql (grant select on all tables in schema public to
-- anon; alter default privileges ... grant select on tables to anon; plus
-- the per-object grants dropped below) to restore the previous surface.

-- ---------------------------------------------------------------------------
-- 1. Remove the blanket anon SELECT (current tables + future default).
-- ---------------------------------------------------------------------------
revoke select on all tables in schema public from anon;
alter default privileges in schema public revoke select on tables from anon;

-- ---------------------------------------------------------------------------
-- 2. Remove unnecessary anon write access. The only writers are now the
--    server actions (report-actions.ts / sponsored-photographer-analytics.ts),
--    which run through the service-role client and bypass RLS, so the
--    previous insert policies are dropped rather than left as dead surface.
-- ---------------------------------------------------------------------------
revoke insert on public.sponsored_photographer_events from anon;
drop policy if exists sponsored_photographer_events_insert_public on public.sponsored_photographer_events;

drop policy if exists location_reports_insert_any on public.location_reports;

-- ---------------------------------------------------------------------------
-- 3. Stop exposing internal site configuration to non-service roles. The
--    footer/social links and the location-info-table config are read only
--    by src/lib/public-data.ts (service role). site_settings_admin_all is
--    retained for admin access.
-- ---------------------------------------------------------------------------
drop policy if exists site_settings_public_read on public.site_settings;

-- ---------------------------------------------------------------------------
-- 4. Slug-redirect history: remove public table reads and expose only a
--    single-slug lookup through security-definer RPCs (used by src/proxy.ts).
-- ---------------------------------------------------------------------------
drop policy if exists location_slug_redirects_public_read on public.location_slug_redirects;
drop policy if exists studio_slug_redirects_public_read on public.studio_slug_redirects;

create function public.get_location_slug_redirect(p_old_slug text)
returns table (redirect_to text)
language sql
security definer
stable
set search_path = public
as $$
  select redirect_to
  from public.location_slug_redirects
  where old_slug = p_old_slug
  limit 1;
$$;

create function public.get_studio_slug_redirect(p_old_slug text)
returns table (redirect_to text)
language sql
security definer
stable
set search_path = public
as $$
  select redirect_to
  from public.studio_slug_redirects
  where old_slug = p_old_slug
  limit 1;
$$;

revoke execute on function public.get_location_slug_redirect(text) from public;
grant execute on function public.get_location_slug_redirect(text) to anon, authenticated;
revoke execute on function public.get_studio_slug_redirect(text) from public;
grant execute on function public.get_studio_slug_redirect(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Revoke anon EXECUTE on the public-data RPCs. These are all called
--    server-side through the service role now; nothing legitimate calls them
--    as anon or authenticated, and several return contact information that
--    should not be sweepable by enumerating location UUIDs.
-- ---------------------------------------------------------------------------
revoke execute on function public.get_approved_photographer_photos(uuid) from public;
revoke execute on function public.get_approved_photographer_photos(uuid) from anon;
revoke execute on function public.get_approved_photographer_photos(uuid) from authenticated;
grant execute on function public.get_approved_photographer_photos(uuid) to service_role;

revoke execute on function public.get_approved_location_comments(uuid, int, int) from public;
revoke execute on function public.get_approved_location_comments(uuid, int, int) from anon;
revoke execute on function public.get_approved_location_comments(uuid, int, int) from authenticated;
grant execute on function public.get_approved_location_comments(uuid, int, int) to service_role;

revoke execute on function public.get_location_rating_summary(uuid) from public;
revoke execute on function public.get_location_rating_summary(uuid) from anon;
revoke execute on function public.get_location_rating_summary(uuid) from authenticated;
grant execute on function public.get_location_rating_summary(uuid) to service_role;

revoke execute on function public.get_shared_favourite_location_ids(text) from public;
revoke execute on function public.get_shared_favourite_location_ids(text) from anon;
revoke execute on function public.get_shared_favourite_location_ids(text) from authenticated;
grant execute on function public.get_shared_favourite_location_ids(text) to service_role;

revoke execute on function public.get_shared_location_collection(text) from public;
revoke execute on function public.get_shared_location_collection(text) from anon;
revoke execute on function public.get_shared_location_collection(text) from authenticated;
grant execute on function public.get_shared_location_collection(text) to service_role;

revoke execute on function public.shared_location_collection_has_location(text, text) from public;
revoke execute on function public.shared_location_collection_has_location(text, text) from anon;
revoke execute on function public.shared_location_collection_has_location(text, text) from authenticated;
grant execute on function public.shared_location_collection_has_location(text, text) to service_role;
