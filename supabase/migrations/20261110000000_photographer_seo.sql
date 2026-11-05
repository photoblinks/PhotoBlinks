-- Admin-managed SEO for photographer pages.
--  * photographer_geo_seo: banner / H1 / title tag / meta description for the
--    photographer State and City pages (/photographers/[country]/[state][/city]).
--    Separate from states/cities so location SEO is untouched. Public read
--    (nothing sensitive); admin write.
--  * location_editorial gains scopes photographer_state / photographer_city so
--    the existing blog editor, draft/publish flow and RLS are reused.
--  * photographer_profiles.seo_title / seo_description: per-photographer title
--    tag and meta description. Admin only (guarded in the status-fields trigger).
--
-- Additive. Reversible via:
--   drop table public.photographer_geo_seo;
--   delete from public.location_editorial where scope in ('photographer_state','photographer_city');
--   (restore the scope checks from 20261105000000_city_editorial.sql, drop the two photographer_* indexes)
--   alter table public.location_editorial drop column city_slug;
--   alter table public.photographer_profiles drop column seo_title, drop column seo_description;
--   (restore get_public_photographers / protect_photographer_status_fields from 20261109010000)

-- Photographer cities are free text on the profile (no cities row), so a city
-- page is identified by (state, city_slug).
create table public.photographer_geo_seo (
  id               uuid primary key default gen_random_uuid(),
  state_id         uuid not null references public.states (id) on delete cascade,
  city_slug        text,
  image_url        text,
  h1_title         text,
  meta_title       text,
  meta_description text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index photographer_geo_seo_state_uq
  on public.photographer_geo_seo (state_id) where city_slug is null;
create unique index photographer_geo_seo_city_uq
  on public.photographer_geo_seo (state_id, city_slug) where city_slug is not null;

create trigger photographer_geo_seo_set_updated_at
  before update on public.photographer_geo_seo
  for each row execute function public.set_updated_at();

alter table public.photographer_geo_seo enable row level security;

create policy photographer_geo_seo_public_read on public.photographer_geo_seo
  for select using (true);
create policy photographer_geo_seo_admin_all on public.photographer_geo_seo
  for all using (public.is_admin()) with check (public.is_admin());

-- Blog scopes for the photographer State / City pages (city by slug, see above).
alter table public.location_editorial
  add column city_slug text;

alter table public.location_editorial
  drop constraint location_editorial_scope_check,
  drop constraint location_editorial_scope_target_check;

alter table public.location_editorial
  add constraint location_editorial_scope_check
    check (scope in ('state', 'state_category', 'city', 'photographer_state', 'photographer_city')),
  add constraint location_editorial_scope_target_check check (
    (scope in ('state', 'photographer_state') and category_id is null and city_id is null and city_slug is null)
    or (scope = 'state_category' and category_id is not null and city_id is null and city_slug is null)
    or (scope = 'city' and category_id is null and city_id is not null and city_slug is null)
    or (scope = 'photographer_city' and category_id is null and city_id is null and city_slug is not null)
  );

create unique index location_editorial_photographer_state_uq
  on public.location_editorial (state_id) where scope = 'photographer_state';
create unique index location_editorial_photographer_city_uq
  on public.location_editorial (state_id, city_slug) where scope = 'photographer_city';

-- Per-photographer SEO (admin only).
alter table public.photographer_profiles
  add column seo_title text,
  add column seo_description text;

create or replace function public.protect_photographer_status_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    if (new.is_active is distinct from old.is_active)
       or (new.suspended_at is distinct from old.suspended_at)
       or (new.is_verified is distinct from old.is_verified)
       or (new.seo_title is distinct from old.seo_title)
       or (new.seo_description is distinct from old.seo_description) then
      raise exception 'is_active, suspended_at, is_verified and SEO fields can only be modified by an admin.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop function public.get_public_photographers(text);

create function public.get_public_photographers(p_slug text default null)
returns table (
  id                     uuid,
  slug                   text,
  display_name           text,
  studio_name            text,
  bio                    text,
  avatar_url             text,
  instagram_url          text,
  portfolio_url          text,
  phone_number           text,
  whatsapp_number        text,
  city                   text,
  city_slug              text,
  state_name             text,
  state_slug             text,
  country_name           text,
  country_slug           text,
  starting_price         integer,
  experience_years       smallint,
  services               text[],
  languages              text[],
  travels_to_other_cities boolean,
  created_at             timestamptz,
  logo_url               text,
  banner_url             text,
  starting_actual_price  integer,
  offers_pre_wedding     boolean,
  offers_wedding         boolean,
  is_verified            boolean,
  youtube_url            text,
  seo_title              text,
  seo_description        text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.slug,
    p.display_name,
    p.studio_name,
    p.bio,
    p.avatar_url,
    p.instagram_url,
    p.portfolio_url,
    p.phone_number,
    p.whatsapp_number,
    p.city,
    public.slugify_text(p.city),
    s.name,
    s.slug,
    c.name,
    c.slug,
    pk.effective_price,
    p.experience_years,
    p.services,
    p.languages,
    p.travels_to_other_cities,
    p.created_at,
    p.logo_url,
    p.banner_url,
    pk.actual_price,
    p.offers_pre_wedding,
    p.offers_wedding,
    p.is_verified,
    p.youtube_url,
    p.seo_title,
    p.seo_description
  from public.photographer_profiles p
  join public.states s on s.id = p.state_id and s.is_active
  join public.countries c on c.id = p.country_id and c.is_active
  left join lateral (
    select coalesce(k.offer_price, k.actual_price) as effective_price, k.actual_price
    from public.photographer_packages k
    where k.photographer_id = p.user_id and k.is_visible
    order by coalesce(k.offer_price, k.actual_price)
    limit 1
  ) pk on true
  where p.is_active
    and p.suspended_at is null
    and (p_slug is null or p.slug = p_slug)
    and (
      exists (select 1 from public.email_verifications v where v.user_id = p.user_id)
      or exists (
        select 1 from auth.users u
        where u.id = p.user_id
          and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
      )
    )
  order by p.created_at desc;
$$;

revoke execute on function public.get_public_photographers(text) from public, anon, authenticated;
grant execute on function public.get_public_photographers(text) to service_role;
