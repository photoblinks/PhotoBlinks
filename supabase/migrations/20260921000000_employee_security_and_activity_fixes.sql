-- Corrective migration for the employee/activity migrations
-- (20260916000000 .. 20260920000000). Applied AFTER them; it only redefines
-- objects those migrations create, so it touches no pre-existing production
-- table row, column, or policy. Idempotent (create or replace / drop-if-exists /
-- revoke / grant).
--
-- 1. Guard triggers: trusted DB contexts (postgres, service_role, future data
--    migrations) may perform maintenance writes; application users may not.
-- 2. EXECUTE grants: explicit and least-privilege; no reliance on Supabase's
--    default ACLs (which are changing to "not auto-exposed").
-- 3. Employee RLS: policies scoped `to authenticated` (anon never evaluates
--    them and needs no EXECUTE) with has_permission() wrapped in a scalar
--    subquery so it runs once per statement, not once per row.
-- 4. Activity summary: Asia/Kolkata day/month boundaries, gated by
--    activity.view (not dashboard.view).
--
-- ROLLBACK (manual; there are no down migrations): re-run the bodies of
--   protect_location_publish_status / protect_studio_publish_status
--   (20260918000000), protect_location_content_fields /
--   protect_studio_content_fields (20260919000000) and
--   get_admin_activity_summary (20260920000000) to restore the previous
--   definitions; recreate the section-3 policies from 20260918000000; then
--   `drop function public.is_trusted_db_context()`. Grants can be re-issued
--   with the previous (default-ACL) behaviour by `grant execute ... to public`.
--   No data is modified by this migration, so no data restore is needed.

-- ---------------------------------------------------------------------------
-- 1. Trusted database context for guard triggers
-- ---------------------------------------------------------------------------
-- A context is trusted only when ALL of these hold:
--   * no end-user identity:      auth.uid() is null
--   * no anon/authenticated JWT: auth.role() is null (direct connection) or
--                                'service_role'
--   * the executing role bypasses RLS (pg_roles.rolbypassrls). That is exactly
--     the set of roles (postgres, service_role, supabase_admin) that already
--     ignore every RLS policy, so exempting them from these row-guard triggers
--     grants no capability they do not already have.
-- Executing role names are not hardcoded; the role attribute decides.
-- SECURITY INVOKER on purpose: current_user must be the caller. Inside a
-- SECURITY DEFINER function owned by postgres current_user is postgres, which
-- is why auth.uid()/auth.role() are also required (a real user's or anon's JWT
-- claims stay set for the whole request and fail those two checks).
-- Application users cannot forge this: PostgREST derives role/sub only from a
-- signature-verified JWT and switches only to anon/authenticated/service_role;
-- end users have no way to run SET ROLE or set request.jwt.claims themselves.

create or replace function public.is_trusted_db_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is null
     and (auth.role() is null or auth.role() = 'service_role')
     and exists (
       select 1 from pg_catalog.pg_roles
       where rolname = current_user and rolbypassrls
     );
$$;

revoke all on function public.is_trusted_db_context() from public;
grant execute on function public.is_trusted_db_context() to anon, authenticated, service_role;

create or replace function public.protect_location_publish_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if new.is_published is distinct from old.is_published
     and not public.has_permission('locations.publish') then
    raise exception 'You do not have permission to publish or unpublish locations.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.protect_studio_publish_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if new.is_published is distinct from old.is_published
     and not public.has_permission('studios.publish') then
    raise exception 'You do not have permission to publish or unpublish studios.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.protect_location_content_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if not public.has_permission('locations.edit')
     and (to_jsonb(new) - 'is_published' - 'updated_at') is distinct from
         (to_jsonb(old) - 'is_published' - 'updated_at') then
    raise exception 'You do not have permission to edit locations.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.protect_studio_content_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if not public.has_permission('studios.edit')
     and (to_jsonb(new) - 'is_published' - 'updated_at') is distinct from
         (to_jsonb(old) - 'is_published' - 'updated_at') then
    raise exception 'You do not have permission to edit studios.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Explicit, least-privilege EXECUTE grants for the employee functions
-- ---------------------------------------------------------------------------
-- has_permission() must stay SECURITY DEFINER: under SECURITY INVOKER the
-- caller cannot read employees/employee_role_permissions (admin-only RLS), so
-- every employee would evaluate to false. It only answers about the calling
-- session's own auth.uid() and returns a boolean, so it discloses nothing.
-- Section 3 makes the employee policies apply only to `authenticated`, so anon
-- never evaluates it and needs no EXECUTE.

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

revoke all on function public.is_employee() from public, anon;
grant execute on function public.is_employee() to authenticated;

revoke all on function public.get_my_permissions() from public, anon;
grant execute on function public.get_my_permissions() to authenticated;

revoke all on function public.admin_find_user_by_email(text) from public, anon;
grant execute on function public.admin_find_user_by_email(text) to authenticated;

revoke all on function public.get_admin_employees(boolean, text, int, int) from public, anon;
grant execute on function public.get_admin_employees(boolean, text, int, int) to authenticated;

revoke all on function public.get_admin_employees_count(boolean, text) from public, anon;
grant execute on function public.get_admin_employees_count(boolean, text) to authenticated;

revoke all on function public.get_admin_activity_summary() from public, anon;
grant execute on function public.get_admin_activity_summary() to authenticated;

-- Table privileges. RLS already denies anon everywhere here; these make that
-- independent of default table ACLs and grant service_role (activity writes)
-- explicitly.
revoke all on public.employee_roles, public.employee_permissions,
              public.employee_role_permissions, public.employees from anon;
grant select, insert, update, delete on public.employee_roles, public.employee_permissions,
              public.employee_role_permissions, public.employees to authenticated;

revoke all on public.activity_events from anon, authenticated;
grant select, insert on public.activity_events to service_role;

-- ---------------------------------------------------------------------------
-- 3. Employee RLS: `to authenticated` + once-per-statement has_permission()
-- ---------------------------------------------------------------------------
-- Meaning is unchanged: same operations, same permission codes. Only the role
-- scope (anon excluded, it never held an employee permission) and evaluation
-- strategy change. `(select ...)` becomes an InitPlan evaluated once per
-- statement; auth.uid() is constant within a statement so the result is the
-- same value every row would have produced.

drop policy if exists locations_employee_select on public.locations;
drop policy if exists locations_employee_insert on public.locations;
drop policy if exists locations_employee_update on public.locations;
create policy locations_employee_select on public.locations
  for select to authenticated
  using ((select public.has_permission('locations.edit')) or (select public.has_permission('locations.publish')));
create policy locations_employee_insert on public.locations
  for insert to authenticated
  with check ((select public.has_permission('locations.edit')));
create policy locations_employee_update on public.locations
  for update to authenticated
  using ((select public.has_permission('locations.edit')) or (select public.has_permission('locations.publish')))
  with check ((select public.has_permission('locations.edit')) or (select public.has_permission('locations.publish')));

drop policy if exists location_images_employee_select on public.location_images;
drop policy if exists location_images_employee_insert on public.location_images;
drop policy if exists location_images_employee_update on public.location_images;
drop policy if exists location_images_employee_delete on public.location_images;
create policy location_images_employee_select on public.location_images
  for select to authenticated
  using ((select public.has_permission('locations.edit')) or (select public.has_permission('locations.publish')));
create policy location_images_employee_insert on public.location_images
  for insert to authenticated with check ((select public.has_permission('locations.edit')));
create policy location_images_employee_update on public.location_images
  for update to authenticated using ((select public.has_permission('locations.edit')))
  with check ((select public.has_permission('locations.edit')));
create policy location_images_employee_delete on public.location_images
  for delete to authenticated using ((select public.has_permission('locations.edit')));

drop policy if exists location_faqs_employee_select on public.location_faqs;
drop policy if exists location_faqs_employee_insert on public.location_faqs;
drop policy if exists location_faqs_employee_update on public.location_faqs;
drop policy if exists location_faqs_employee_delete on public.location_faqs;
create policy location_faqs_employee_select on public.location_faqs
  for select to authenticated
  using ((select public.has_permission('locations.edit')) or (select public.has_permission('locations.publish')));
create policy location_faqs_employee_insert on public.location_faqs
  for insert to authenticated with check ((select public.has_permission('locations.edit')));
create policy location_faqs_employee_update on public.location_faqs
  for update to authenticated using ((select public.has_permission('locations.edit')))
  with check ((select public.has_permission('locations.edit')));
create policy location_faqs_employee_delete on public.location_faqs
  for delete to authenticated using ((select public.has_permission('locations.edit')));

drop policy if exists studios_employee_select on public.studios;
drop policy if exists studios_employee_insert on public.studios;
drop policy if exists studios_employee_update on public.studios;
create policy studios_employee_select on public.studios
  for select to authenticated
  using ((select public.has_permission('studios.edit')) or (select public.has_permission('studios.publish')));
create policy studios_employee_insert on public.studios
  for insert to authenticated
  with check ((select public.has_permission('studios.edit')));
create policy studios_employee_update on public.studios
  for update to authenticated
  using ((select public.has_permission('studios.edit')) or (select public.has_permission('studios.publish')))
  with check ((select public.has_permission('studios.edit')) or (select public.has_permission('studios.publish')));

drop policy if exists studio_images_employee_select on public.studio_images;
drop policy if exists studio_images_employee_insert on public.studio_images;
drop policy if exists studio_images_employee_update on public.studio_images;
drop policy if exists studio_images_employee_delete on public.studio_images;
create policy studio_images_employee_select on public.studio_images
  for select to authenticated
  using ((select public.has_permission('studios.edit')) or (select public.has_permission('studios.publish')));
create policy studio_images_employee_insert on public.studio_images
  for insert to authenticated with check ((select public.has_permission('studios.edit')));
create policy studio_images_employee_update on public.studio_images
  for update to authenticated using ((select public.has_permission('studios.edit')))
  with check ((select public.has_permission('studios.edit')));
create policy studio_images_employee_delete on public.studio_images
  for delete to authenticated using ((select public.has_permission('studios.edit')));

drop policy if exists studio_pricing_options_employee_select on public.studio_pricing_options;
drop policy if exists studio_pricing_options_employee_insert on public.studio_pricing_options;
drop policy if exists studio_pricing_options_employee_update on public.studio_pricing_options;
drop policy if exists studio_pricing_options_employee_delete on public.studio_pricing_options;
create policy studio_pricing_options_employee_select on public.studio_pricing_options
  for select to authenticated
  using ((select public.has_permission('studios.edit')) or (select public.has_permission('studios.publish')));
create policy studio_pricing_options_employee_insert on public.studio_pricing_options
  for insert to authenticated with check ((select public.has_permission('studios.edit')));
create policy studio_pricing_options_employee_update on public.studio_pricing_options
  for update to authenticated using ((select public.has_permission('studios.edit')))
  with check ((select public.has_permission('studios.edit')));
create policy studio_pricing_options_employee_delete on public.studio_pricing_options
  for delete to authenticated using ((select public.has_permission('studios.edit')));

drop policy if exists studio_faqs_employee_select on public.studio_faqs;
drop policy if exists studio_faqs_employee_insert on public.studio_faqs;
drop policy if exists studio_faqs_employee_update on public.studio_faqs;
drop policy if exists studio_faqs_employee_delete on public.studio_faqs;
create policy studio_faqs_employee_select on public.studio_faqs
  for select to authenticated
  using ((select public.has_permission('studios.edit')) or (select public.has_permission('studios.publish')));
create policy studio_faqs_employee_insert on public.studio_faqs
  for insert to authenticated with check ((select public.has_permission('studios.edit')));
create policy studio_faqs_employee_update on public.studio_faqs
  for update to authenticated using ((select public.has_permission('studios.edit')))
  with check ((select public.has_permission('studios.edit')));
create policy studio_faqs_employee_delete on public.studio_faqs
  for delete to authenticated using ((select public.has_permission('studios.edit')));

-- Editors must be able to SEE every city, including inactive ones: the
-- INSERT ... ON CONFLICT DO UPDATE inside find_or_create_city (SECURITY
-- INVOKER) also requires SELECT visibility of the conflicting row, otherwise an
-- employee typing an existing-but-inactive city name gets an RLS error while an
-- admin does not. Read-only, edit holders only, city name/slug/SEO text only.
drop policy if exists cities_employee_select on public.cities;
drop policy if exists cities_employee_insert on public.cities;
drop policy if exists cities_employee_update on public.cities;
create policy cities_employee_select on public.cities
  for select to authenticated
  using ((select public.has_permission('locations.edit')) or (select public.has_permission('studios.edit')));
create policy cities_employee_insert on public.cities
  for insert to authenticated
  with check ((select public.has_permission('locations.edit')) or (select public.has_permission('studios.edit')));
create policy cities_employee_update on public.cities
  for update to authenticated
  using ((select public.has_permission('locations.edit')) or (select public.has_permission('studios.edit')))
  with check ((select public.has_permission('locations.edit')) or (select public.has_permission('studios.edit')));

-- ---------------------------------------------------------------------------
-- 4. Activity summary: Asia/Kolkata boundaries + activity.view gate
-- ---------------------------------------------------------------------------
-- Raw created_at values are untouched (timestamptz). Only the reporting
-- boundaries and the per-day de-duplication key are computed in Asia/Kolkata:
--   v_day_start / v_month_start = IST midnight / IST 1st-of-month as instants;
--   the work-item key is (entity_id, IST calendar date of created_at).
-- One employee + one entity + one IST day = one work item (unchanged rule).
-- Gated by activity.view (admins pass through has_permission via is_admin()).
-- dashboard.view alone no longer exposes employee activity.

create or replace function public.get_admin_activity_summary()
returns table (
  user_id         uuid,
  display_name    text,
  daily_unique    bigint,
  monthly_unique  bigint,
  locations_count bigint,
  studios_count   bigint,
  last_activity   timestamptz,
  monthly_actions jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_day_start   timestamptz := date_trunc('day',   now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if not public.has_permission('activity.view') then
    raise exception 'Not authorized';
  end if;

  return query
  with active_employees as (
    select e.user_id, e.full_name, u.email
    from public.employees e
    join auth.users u on u.id = e.user_id
    where e.is_active = true
  ),
  monthly_entity as (
    select
      ae.user_id,
      count(distinct (ae.entity_id, (ae.created_at at time zone 'Asia/Kolkata')::date))::bigint as monthly_unique,
      count(distinct ae.entity_id) filter (where ae.module = 'locations')::bigint as locations_count,
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as studios_count,
      count(distinct ae.entity_id) filter (where ae.created_at >= v_day_start)::bigint as daily_unique
    from public.activity_events ae
    where ae.created_at >= v_month_start
    group by ae.user_id
  ),
  monthly_action as (
    select a.user_id, jsonb_object_agg(a.action, a.cnt) as monthly_actions
    from (
      select ae.user_id, ae.action, count(*)::bigint as cnt
      from public.activity_events ae
      where ae.created_at >= v_month_start
      group by ae.user_id, ae.action
    ) a
    group by a.user_id
  ),
  last_activity as (
    select ae.user_id, max(ae.created_at) as last_activity
    from public.activity_events ae
    group by ae.user_id
  )
  select
    emp.user_id,
    coalesce(nullif(emp.full_name, ''), split_part(emp.email, '@', 1)) as display_name,
    coalesce(me.daily_unique, 0),
    coalesce(me.monthly_unique, 0),
    coalesce(me.locations_count, 0),
    coalesce(me.studios_count, 0),
    la.last_activity,
    coalesce(ma.monthly_actions, '{}'::jsonb)
  from active_employees emp
  left join monthly_entity me on me.user_id = emp.user_id
  left join monthly_action ma on ma.user_id = emp.user_id
  left join last_activity la on la.user_id = emp.user_id
  order by coalesce(me.monthly_unique, 0) desc, emp.email asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Bug fix: get_admin_employees() (20260916000000) fails at runtime
-- ---------------------------------------------------------------------------
-- auth.users.email is varchar(255) but the function declares `email text`;
-- plpgsql RETURN QUERY requires an exact type match, so every call raised
-- 42804 "structure of query does not match function result type". Same
-- signature and body, only `u.email::text` is added.

create or replace function public.get_admin_employees(
  p_active boolean default null,
  p_search text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id         uuid,
  user_id    uuid,
  email      text,
  full_name  text,
  role_id    uuid,
  role_name  text,
  is_active  boolean,
  invited_by uuid,
  created_at timestamptz,
  updated_at timestamptz
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
    e.id,
    e.user_id,
    u.email::text,
    e.full_name,
    e.role_id,
    r.name,
    e.is_active,
    e.invited_by,
    e.created_at,
    e.updated_at
  from public.employees e
  join public.employee_roles r on r.id = e.role_id
  join auth.users u on u.id = e.user_id
  where (p_active is null or e.is_active = p_active)
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or coalesce(e.full_name, '') ilike '%' || p_search || '%'
    )
  order by e.created_at desc
  limit p_limit offset p_offset;
end;
$$;
