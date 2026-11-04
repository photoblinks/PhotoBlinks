-- Hybrid editorial content for City pages (scope 'city'), rendered on both
-- /locations/[country]/[state]/[city] and /studios/[country]/[state]/[city].
-- Extends location_editorial (20260924000000) — same draft/publish model and
-- RLS; state_id stays populated (derived from the city) so existing indexes
-- and policies are unchanged.
--
-- Additive: widens the scope check, adds a nullable city_id.
-- Reversible via:
--   delete from public.location_editorial where scope = 'city';
--   drop index public.location_editorial_city_uq;
--   alter table public.location_editorial drop constraint location_editorial_scope_target_check;
--   alter table public.location_editorial drop constraint location_editorial_scope_check;
--   alter table public.location_editorial drop column city_id;
--   (then restore the two original checks)

alter table public.location_editorial
  drop constraint if exists location_editorial_scope_check,
  drop constraint if exists location_editorial_scope_category_check;

alter table public.location_editorial
  add column city_id uuid references public.cities (id) on delete cascade;

alter table public.location_editorial
  add constraint location_editorial_scope_check
    check (scope in ('state', 'state_category', 'city')),
  add constraint location_editorial_scope_target_check check (
    (scope = 'state' and category_id is null and city_id is null)
    or (scope = 'state_category' and category_id is not null and city_id is null)
    or (scope = 'city' and category_id is null and city_id is not null)
  );

-- One row per city. The existing state indexes are partial on scope, so city
-- rows never collide with them.
create unique index location_editorial_city_uq
  on public.location_editorial (city_id)
  where scope = 'city';
