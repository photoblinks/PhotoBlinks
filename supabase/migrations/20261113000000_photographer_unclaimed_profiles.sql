-- Unclaimed photographer profiles for admin bulk import.
--
-- 1. photographer_profiles.user_id becomes nullable: a profile created by an
--    admin bulk import has no login yet (a later "claim" flow will set it).
--    The UNIQUE constraint still holds (Postgres allows many NULLs). Rows are
--    created inactive ("on_hold" = the draft state) and go live via the
--    existing Activate action.
-- 2. get_admin_photographer_profiles(+_count): left join auth.users so
--    unclaimed rows are listed (email/last_sign_in_at are NULL for them).
-- 3. get_public_photographers: an active unclaimed profile is public without
--    the email-verified check (there is no account to verify).
--
-- Reversible via: delete unclaimed rows, then
--   alter table public.photographer_profiles alter column user_id set not null;
--   (restore both admin RPCs from 20261010000000_admin_users_and_photographers_rpc.sql
--    and get_public_photographers from 20261110000000_photographer_seo.sql)

alter table public.photographer_profiles alter column user_id drop not null;

create or replace function public.get_admin_photographer_profiles(
  p_status text default null,
  p_search text default null,
  p_profile_id uuid default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id              uuid,
  user_id         uuid,
  email           text,
  display_name    text,
  studio_name     text,
  bio             text,
  phone_number    text,
  whatsapp_number text,
  instagram_url   text,
  portfolio_url   text,
  country_id      uuid,
  state_id        uuid,
  city            text,
  country_name    text,
  state_name      text,
  is_active       boolean,
  suspended_at    timestamptz,
  status          text,
  created_at      timestamptz,
  last_sign_in_at timestamptz
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
    p.id,
    p.user_id,
    u.email::text,
    p.display_name,
    p.studio_name,
    p.bio,
    p.phone_number,
    p.whatsapp_number,
    p.instagram_url,
    p.portfolio_url,
    p.country_id,
    p.state_id,
    p.city,
    c.name,
    s.name,
    p.is_active,
    p.suspended_at,
    case
      when p.is_active then 'active'
      when p.suspended_at is not null then 'suspended'
      else 'on_hold'
    end,
    p.created_at,
    u.last_sign_in_at
  from public.photographer_profiles p
  left join auth.users u on u.id = p.user_id
  left join public.countries c on c.id = p.country_id
  left join public.states s on s.id = p.state_id
  where (p_profile_id is null or p.id = p_profile_id)
    and (
      p_status is null
      or (p_status = 'active' and p.is_active)
      or (p_status = 'suspended' and not p.is_active and p.suspended_at is not null)
      or (p_status = 'on_hold' and not p.is_active and p.suspended_at is null)
    )
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or p.display_name ilike '%' || p_search || '%'
      or p.studio_name ilike '%' || p_search || '%'
      or p.phone_number ilike '%' || p_search || '%'
    )
  order by p.created_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_admin_photographer_profiles_count(
  p_status text default null,
  p_search text default null
)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return (
    select count(*)
    from public.photographer_profiles p
    left join auth.users u on u.id = p.user_id
    where (
        p_status is null
        or (p_status = 'active' and p.is_active)
        or (p_status = 'suspended' and not p.is_active and p.suspended_at is not null)
        or (p_status = 'on_hold' and not p.is_active and p.suspended_at is null)
      )
      and (
        p_search is null
        or u.email ilike '%' || p_search || '%'
        or p.display_name ilike '%' || p_search || '%'
        or p.studio_name ilike '%' || p_search || '%'
        or p.phone_number ilike '%' || p_search || '%'
      )
  );
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
