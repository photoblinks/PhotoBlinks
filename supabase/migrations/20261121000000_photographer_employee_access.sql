-- Employee access to the photographer admin modules (everything except
-- Sponsored placements, which stay admin-only).
--
--   photographers.edit    create/edit profiles, drafts, bulk import, geo SEO
--   photographers.publish approve drafts/requests/claims/photos (activate only)
--
-- Suspend / put on hold / verified tick remain admin-only: the trigger below
-- lets a non-admin set is_active = true (with suspended_at null) only.
-- Additive: legacy is_admin() policies are untouched; the admin-only RPCs are
-- redefined with the same signature and body, only the guard is widened.
--
-- ROLLBACK (manual): restore the function bodies from 20260912000000,
-- 20261106000000, 20261110000000, 20261114000000, 20261115000000 and
-- 20261116000000; drop the policies created below; delete the two permissions.

-- ---------------------------------------------------------------------------
-- 1. Permissions (same two roles that already manage locations/studios)
-- ---------------------------------------------------------------------------

insert into public.employee_permissions (code, description) values
  ('photographers.edit',    'Create and edit photographer profiles, drafts, bulk imports and photographer SEO.'),
  ('photographers.publish', 'Approve photographer drafts, signup requests, claims and photos.')
on conflict (code) do nothing;

insert into public.employee_role_permissions (role_id, permission_id)
select r.id, p.id
from public.employee_roles r
cross join public.employee_permissions p
where r.slug in ('content_manager', 'operations')
  and p.code in ('photographers.edit', 'photographers.publish')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Profile status/content guard
-- ---------------------------------------------------------------------------

create or replace function public.protect_photographer_status_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new jsonb;
  v_old jsonb;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified then
    raise exception 'The verified badge can only be modified by an admin.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Non-admins may only activate (publish holders); never hold or suspend.
  if (new.is_active is distinct from old.is_active
      or new.suspended_at is distinct from old.suspended_at)
     and not (public.has_permission('photographers.publish')
              and new.is_active and new.suspended_at is null) then
    raise exception 'is_active and suspended_at can only be modified by an admin (employees may activate).'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.seo_title is distinct from old.seo_title
      or new.seo_description is distinct from old.seo_description)
     and not public.has_permission('photographers.edit') then
    raise exception 'SEO fields can only be modified by an admin or an editor.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Publish-only employees may not change anything else on someone's profile.
  -- Claim approval (a SECURITY DEFINER function) flags itself to assign user_id.
  if auth.uid() is not null
     and old.user_id is distinct from auth.uid()
     and not public.has_permission('photographers.edit') then
    v_new := to_jsonb(new) - 'is_active' - 'suspended_at' - 'updated_at';
    v_old := to_jsonb(old) - 'is_active' - 'suspended_at' - 'updated_at';
    if coalesce(current_setting('app.photographer_claim_approval', true), '') = 'on' then
      v_new := v_new - 'user_id';
      v_old := v_old - 'user_id';
    end if;
    if v_new is distinct from v_old then
      raise exception 'You do not have permission to edit photographer profiles.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Admin RPCs: widen the guard
-- ---------------------------------------------------------------------------

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
  if not (public.has_permission('photographers.edit') or public.has_permission('photographers.publish')) then
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
      p_profile_id is not null
      or (p_status is null and not (p.user_id is null and not p.is_active and p.suspended_at is null))
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
  if not (public.has_permission('photographers.edit') or public.has_permission('photographers.publish')) then
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

create or replace function public.get_admin_photographer_submissions(
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id                       uuid,
  image_url                text,
  title                    text,
  description              text,
  phone_number             text,
  status                   text,
  rejection_reason         text,
  r2_deletion_status       text,
  reviewed_at              timestamptz,
  created_at               timestamptz,
  photographer_display_name text,
  photographer_phone       text,
  location_name            text,
  location_slug            text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  return query
  select
    pps.id,
    pps.image_url,
    pps.title,
    pps.description,
    pps.phone_number,
    pps.status,
    pps.rejection_reason,
    pps.r2_deletion_status,
    pps.reviewed_at,
    pps.created_at,
    pp.display_name  as photographer_display_name,
    pp.phone_number  as photographer_phone,
    l.name           as location_name,
    l.slug           as location_slug
  from public.photographer_photo_submissions pps
  join public.photographer_profiles pp on pp.user_id = pps.photographer_id
  join public.locations             l  on l.id       = pps.location_id
  where p_status is null or pps.status = p_status
  order by pps.created_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_admin_photographer_submissions_count(p_status text default null)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result bigint;
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from public.photographer_photo_submissions pps
  where p_status is null or pps.status = p_status;

  return result;
end;
$$;

create or replace function public.get_unverified_user_ids(p_ids uuid[])
returns setof uuid
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  return query
  select i
  from unnest(p_ids) as i
  where not exists (select 1 from public.email_verifications v where v.user_id = i)
    and not exists (
      select 1 from auth.users u
      where u.id = i
        and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
    );
end;
$$;

create or replace function public.is_email_verified(p_user uuid default auth.uid())
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_user is null then
    return false;
  end if;
  if p_user is distinct from auth.uid() and not public.has_permission('photographers.publish') then
    return false;
  end if;

  return exists (select 1 from public.email_verifications where user_id = p_user)
    or exists (
      select 1 from auth.users u
      where u.id = p_user
        and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
    );
end;
$$;

create or replace function public.approve_photographer_claim(p_claim_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.photographer_claim_requests;
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  select * into v_claim from public.photographer_claim_requests
    where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then
    raise exception 'This request is no longer pending.';
  end if;

  perform 1 from public.photographer_profiles where id = v_claim.profile_id for update;
  if not exists (
    select 1 from public.photographer_profiles
    where id = v_claim.profile_id and user_id is null
  ) then
    raise exception 'This profile has already been claimed.';
  end if;

  if exists (select 1 from public.photographer_profiles where user_id = v_claim.user_id) then
    raise exception 'This account already has a photographer profile.';
  end if;

  perform set_config('app.photographer_claim_approval', 'on', true);
  update public.photographer_profiles set user_id = v_claim.user_id where id = v_claim.profile_id;
  perform set_config('app.photographer_claim_approval', 'off', true);

  update public.photographer_claim_requests
    set status = 'approved', reviewed_at = now() where id = v_claim.id;
  update public.photographer_claim_requests
    set status = 'rejected', reviewed_at = now()
    where profile_id = v_claim.profile_id and status = 'pending' and id <> v_claim.id;

  insert into public.email_verifications (user_id) values (v_claim.user_id)
    on conflict do nothing;

  return v_claim.email;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Employee RLS (to authenticated; has_permission evaluated once per statement)
-- ---------------------------------------------------------------------------

create policy photographer_profiles_employee_select on public.photographer_profiles
  for select to authenticated
  using ((select public.has_permission('photographers.edit')) or (select public.has_permission('photographers.publish')));

-- Employees create DRAFTS only (bulk import): unclaimed and inactive.
create policy photographer_profiles_employee_insert on public.photographer_profiles
  for insert to authenticated
  with check (
    (select public.has_permission('photographers.edit'))
    and user_id is null and is_active = false and suspended_at is null
  );

create policy photographer_profiles_employee_update on public.photographer_profiles
  for update to authenticated
  using ((select public.has_permission('photographers.edit')) or (select public.has_permission('photographers.publish')))
  with check ((select public.has_permission('photographers.edit')) or (select public.has_permission('photographers.publish')));

create policy pps_employee_select on public.photographer_photo_submissions
  for select to authenticated
  using ((select public.has_permission('photographers.publish')));

create policy pps_employee_update on public.photographer_photo_submissions
  for update to authenticated
  using ((select public.has_permission('photographers.publish')))
  with check ((select public.has_permission('photographers.publish')));

create policy photographer_claim_requests_employee_select on public.photographer_claim_requests
  for select to authenticated
  using ((select public.has_permission('photographers.publish')));

create policy photographer_claim_requests_employee_update on public.photographer_claim_requests
  for update to authenticated
  using ((select public.has_permission('photographers.publish')))
  with check ((select public.has_permission('photographers.publish')));

create policy photographer_geo_seo_employee_write on public.photographer_geo_seo
  for all to authenticated
  using ((select public.has_permission('photographers.edit')))
  with check ((select public.has_permission('photographers.edit')));
