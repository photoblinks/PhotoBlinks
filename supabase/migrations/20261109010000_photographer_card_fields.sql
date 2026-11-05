-- Photographer cards: logo, banner image, a package-derived price and the
-- shoot types offered (pre-wedding on by default, wedding opt-in).
--
-- 1. photographer_profiles gets nullable logo_url and banner_url (additive;
--    existing rows are untouched and photographers fill them in from the
--    profile edit page). offers_pre_wedding (default true) and offers_wedding
--    (default false) record which services the photographer offers.
-- 2. get_public_photographers returns the new columns, and now returns the
--    phone/WhatsApp numbers in the listing too, so cards can offer one-click
--    Call / WhatsApp. Still executable by service_role only.
-- 3. starting_price is no longer the manually typed profile value: it is the
--    lowest effective price (offer price if set, else actual price) across the
--    photographer's visible packages, NULL when they have none.
--    starting_actual_price is that same package's actual price, so the card
--    can show the offer next to a struck-through original.
--
-- 4. is_verified: an admin-granted "verified" blue tick. Photographers cannot
--    set it themselves: protect_photographer_status_fields now guards it
--    alongside is_active and suspended_at.
--
-- Reversible via:
--   (restore get_public_photographers from 20261108000000_public_photographers.sql)
--   alter table public.photographer_profiles drop column logo_url,
--     drop column banner_url, drop column offers_pre_wedding,
--     drop column offers_wedding, drop column is_verified,
--     drop column youtube_url;
--   (restore protect_photographer_status_fields from 20260909010000_photographer_profiles.sql)

alter table public.photographer_profiles
  add column logo_url   text,
  add column banner_url text,
  add column offers_pre_wedding boolean not null default true,
  add column offers_wedding     boolean not null default false,
  add column is_verified        boolean not null default false,
  add column youtube_url        text;

create or replace function public.protect_photographer_status_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    if (new.is_active is distinct from old.is_active)
       or (new.suspended_at is distinct from old.suspended_at)
       or (new.is_verified is distinct from old.is_verified) then
      raise exception 'is_active, suspended_at and is_verified can only be modified by an admin.'
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
  youtube_url            text
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
    p.youtube_url
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
