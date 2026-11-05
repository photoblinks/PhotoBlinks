-- Hybrid editorial blog for City + Category pages
-- (/locations/[country]/[state]/[city]/[category]). Until now that page showed
-- the State + Category blog; it now has its own row per (city, category).
-- Extends location_editorial: widens the scope checks and adds a partial
-- unique index. Same draft/publish model and RLS; additive.
--
-- Reversible via:
--   delete from public.location_editorial where scope = 'city_category';
--   drop index public.location_editorial_city_category_uq;
--   (restore the two scope checks from 20261110000000_photographer_seo.sql)

alter table public.location_editorial
  drop constraint location_editorial_scope_check,
  drop constraint location_editorial_scope_target_check;

alter table public.location_editorial
  add constraint location_editorial_scope_check
    check (scope in ('state', 'state_category', 'city', 'city_category', 'photographer_state', 'photographer_city')),
  add constraint location_editorial_scope_target_check check (
    (scope in ('state', 'photographer_state') and category_id is null and city_id is null and city_slug is null)
    or (scope = 'state_category' and category_id is not null and city_id is null and city_slug is null)
    or (scope = 'city' and category_id is null and city_id is not null and city_slug is null)
    or (scope = 'city_category' and category_id is not null and city_id is not null and city_slug is null)
    or (scope = 'photographer_city' and category_id is null and city_id is null and city_slug is not null)
  );

create unique index location_editorial_city_category_uq
  on public.location_editorial (city_id, category_id)
  where scope = 'city_category';
