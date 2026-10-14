-- Admin-only listing RPCs for the Users and Photographer Profiles pages.
-- auth.users is not readable through PostgREST, so these are security-definer
-- functions guarded by is_admin() (same pattern as get_admin_employees).
-- Purely additive: no tables or policies change.
--
-- Photographer status is derived from the existing columns (no new concept):
--   active    = is_active
--   suspended = not is_active and suspended_at is not null
--   on_hold   = not is_active and suspended_at is null

create function public.get_admin_users(
  p_search text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id                uuid,
  email             text,
  full_name         text,
  provider          text,
  created_at        timestamptz,
  last_sign_in_at   timestamptz,
  email_confirmed_at timestamptz
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
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    u.raw_app_meta_data ->> 'provider',
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  from auth.users u
  where not exists (select 1 from public.admins a where a.user_id = u.id)
    and not exists (select 1 from public.employees e where e.user_id = u.id)
    and not exists (select 1 from public.photographer_profiles p where p.user_id = u.id)
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || p_search || '%'
    )
  order by u.created_at desc
  limit p_limit offset p_offset;
end;
$$;

create function public.get_admin_users_count(p_search text default null)
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
    from auth.users u
    where not exists (select 1 from public.admins a where a.user_id = u.id)
      and not exists (select 1 from public.employees e where e.user_id = u.id)
      and not exists (select 1 from public.photographer_profiles p where p.user_id = u.id)
      and (
        p_search is null
        or u.email ilike '%' || p_search || '%'
        or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || p_search || '%'
      )
  );
end;
$$;

-- p_status: null (all) | 'active' | 'on_hold' | 'suspended'.
-- p_profile_id: when set, returns just that profile (used by the edit page).
create function public.get_admin_photographer_profiles(
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
  join auth.users u on u.id = p.user_id
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

create function public.get_admin_photographer_profiles_count(
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
    join auth.users u on u.id = p.user_id
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
