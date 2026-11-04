-- Photographer signups need admin approval before their profile goes live.
--
-- 1. New photographer_profiles rows start inactive ("on_hold" in the admin
--    status model: is_active = false, suspended_at null). Only an admin can
--    flip is_active (protect_photographer_status_fields), so approval is the
--    existing Activate action. Existing rows are untouched.
-- 2. The own_insert policy now refuses a self-inserted active row, so the
--    default cannot be bypassed by inserting is_active = true from the client.
-- 3. People who signed up through the photographer form (auth metadata
--    photographer_signup = true) are kept out of the general Users list and
--    its "new users" badge even before their profile row exists (email not
--    confirmed yet). They are listed under Photographer Requests instead.

alter table public.photographer_profiles alter column is_active set default false;

drop policy photographer_profiles_own_insert on public.photographer_profiles;
create policy photographer_profiles_own_insert on public.photographer_profiles
  for insert
  with check (user_id = auth.uid() and is_active = false and suspended_at is null);

create or replace function public.get_admin_users(
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
    and u.raw_user_meta_data ->> 'photographer_signup' is distinct from 'true'
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || p_search || '%'
    )
  order by u.created_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_admin_users_count(p_search text default null)
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
    and u.raw_user_meta_data ->> 'photographer_signup' is distinct from 'true'
      and (
        p_search is null
        or u.email ilike '%' || p_search || '%'
        or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || p_search || '%'
      )
  );
end;
$$;

-- Not stable: the first call per admin seeds seen_at = now() so existing
-- accounts do not show up as "new" the moment this ships.
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
    (select count(*) from public.photographer_profiles p where p.created_at > v_photographers_seen);
end;
$$;
