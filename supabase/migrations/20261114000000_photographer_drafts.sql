-- "Draft" photographer profiles = bulk-imported (unclaimed, user_id NULL),
-- inactive and not suspended. They are listed only under the Drafts tab: the
-- admin list functions exclude them from "all" and "on_hold" (and so from
-- Photographer Requests), and the nav "new photographers" badge ignores
-- unclaimed rows. Activating a draft makes it a normal active profile.
-- The returned `status` gains the value 'draft'.
--
-- Reversible via: restore both list functions from
-- 20261113000000_photographer_unclaimed_profiles.sql and
-- get_admin_nav_badge_counts from 20261104000000_photographer_signup_approval.sql.

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
      when p.user_id is null then 'draft'
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
      (p_status is null and not (p.user_id is null and not p.is_active and p.suspended_at is null))
      or (p_status = 'active' and p.is_active)
      or (p_status = 'suspended' and not p.is_active and p.suspended_at is not null)
      or (p_status = 'on_hold' and not p.is_active and p.suspended_at is null and p.user_id is not null)
      or (p_status = 'draft' and not p.is_active and p.suspended_at is null and p.user_id is null)
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
        (p_status is null and not (p.user_id is null and not p.is_active and p.suspended_at is null))
        or (p_status = 'active' and p.is_active)
        or (p_status = 'suspended' and not p.is_active and p.suspended_at is not null)
        or (p_status = 'on_hold' and not p.is_active and p.suspended_at is null and p.user_id is not null)
        or (p_status = 'draft' and not p.is_active and p.suspended_at is null and p.user_id is null)
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

create or replace function public.get_admin_nav_badge_counts()
returns table (
  pending_comments      bigint,
  pending_photos        bigint,
  pending_reports       bigint,
  new_users             bigint,
  new_photographers     bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users_seen timestamptz;
  v_photographers_seen timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  insert into public.admin_page_seen (user_id, page_key)
  values (auth.uid(), 'users'), (auth.uid(), 'photographer_profiles')
  on conflict do nothing;

  select seen_at into v_users_seen
    from public.admin_page_seen where user_id = auth.uid() and page_key = 'users';
  select seen_at into v_photographers_seen
    from public.admin_page_seen where user_id = auth.uid() and page_key = 'photographer_profiles';

  return query
  select
    (select count(*) from public.location_comments where status = 'pending'),
    (select count(*) from public.photographer_photo_submissions where status = 'pending'),
    (select count(*) from public.location_reports where status = 'pending'),
    (select count(*)
       from auth.users u
      where u.created_at > v_users_seen
        and not exists (select 1 from public.admins a where a.user_id = u.id)
        and not exists (select 1 from public.employees e where e.user_id = u.id)
        and not exists (select 1 from public.photographer_profiles p where p.user_id = u.id)
        and u.raw_user_meta_data ->> 'photographer_signup' is distinct from 'true'),
    (select count(*) from public.photographer_profiles p where p.created_at > v_photographers_seen and p.user_id is not null);
end;
$$;
