-- Photographer profiles: Google Business Profile link and Google Maps link for
-- the business address. Additive, nullable; existing rows are untouched.
-- Set from the admin profile edit page and the bulk photographer import, and
-- returned by get_public_photographers so the public profile page can show them.
--
-- Reversible via:
--   (restore get_public_photographers from 20261113000000_photographer_unclaimed_profiles.sql)
--   alter table public.photographer_profiles
--     drop column google_business_url, drop column google_maps_url;

alter table public.photographer_profiles
  add column google_business_url text,
  add column google_maps_url     text;

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
  seo_description        text,
  google_business_url    text,
  google_maps_url        text
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
    p.seo_description,
    p.google_business_url,
    p.google_maps_url
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
      p.user_id is null
      or exists (select 1 from public.email_verifications v where v.user_id = p.user_id)
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
