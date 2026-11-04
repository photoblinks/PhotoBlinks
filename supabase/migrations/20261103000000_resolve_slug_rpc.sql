-- Single-slug lookups for src/proxy.ts: whether a location/studio slug has a
-- 301 redirect and whether it is currently published. One round trip replaces
-- the redirect-only lookup so the proxy can answer 404 for slugs that exist
-- nowhere, before an ISR entry is created for them.
--
-- Additive: get_location_slug_redirect / get_studio_slug_redirect are left in
-- place so a deployment still running the previous proxy keeps working.
-- Each function takes one slug and returns one row {redirect_to, slug_exists};
-- nothing else is readable through it. The redirect target is already public
-- (the proxy answers 301 with it) and "published" is already observable by
-- requesting the page.

create function public.resolve_location_slug(p_slug text)
returns table (redirect_to text, slug_exists boolean)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select r.redirect_to from public.location_slug_redirects r where r.old_slug = p_slug limit 1),
    exists (select 1 from public.locations l where l.slug = p_slug and l.is_published);
$$;

create function public.resolve_studio_slug(p_slug text)
returns table (redirect_to text, slug_exists boolean)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select r.redirect_to from public.studio_slug_redirects r where r.old_slug = p_slug limit 1),
    exists (select 1 from public.studios s where s.slug = p_slug and s.is_published);
$$;

revoke execute on function public.resolve_location_slug(text) from public;
grant execute on function public.resolve_location_slug(text) to anon, authenticated;
revoke execute on function public.resolve_studio_slug(text) from public;
grant execute on function public.resolve_studio_slug(text) to anon, authenticated;
