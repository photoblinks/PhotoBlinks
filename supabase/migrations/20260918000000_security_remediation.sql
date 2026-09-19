-- Phase 3 security remediation (review findings):
--  1. Revoke find_or_create_city() from PUBLIC/anon (it was implicitly
--     executable by everyone via the default PUBLIC grant).
--  2. Replace the broad "FOR ALL" employee RLS policies with explicit,
--     operation-scoped policies keyed to granular permissions.
--  3. Split high-consequence actions out of the generic "manage" permission:
--     publish/unpublish is now its own permission, and DELETE is admin-only.
--  4. Guard is_published at the database level so an editor cannot flip
--     publication status through a direct API call (RLS is row-level, not
--     column-level).
--
-- Purely additive relative to the legacy is_admin() system: no is_admin()
-- policy is altered or dropped.

-- ---------------------------------------------------------------------------
-- 1. find_or_create_city(): least-privilege EXECUTE
-- ---------------------------------------------------------------------------

revoke execute on function public.find_or_create_city(uuid, text) from public;
revoke execute on function public.find_or_create_city(uuid, text) from anon;
grant execute on function public.find_or_create_city(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Replace broad employee policies with explicit operation-scoped ones
-- ---------------------------------------------------------------------------

drop policy if exists locations_employee_manage on public.locations;
drop policy if exists location_images_employee_manage on public.location_images;
drop policy if exists location_faqs_employee_manage on public.location_faqs;
drop policy if exists studios_employee_manage on public.studios;
drop policy if exists studio_images_employee_manage on public.studio_images;
drop policy if exists studio_pricing_options_employee_manage on public.studio_pricing_options;
drop policy if exists studio_faqs_employee_manage on public.studio_faqs;
drop policy if exists cities_employee_insert on public.cities;
drop policy if exists cities_employee_update on public.cities;

-- Locations: edit = create/update (incl. images/FAQs); publish = toggle
-- is_published. There is intentionally NO employee DELETE policy — deleting a
-- location/studio is destructive and remains admin-only.
create policy locations_employee_select on public.locations
  for select
  using (public.has_permission('locations.edit') or public.has_permission('locations.publish'));
create policy locations_employee_insert on public.locations
  for insert
  with check (public.has_permission('locations.edit'));
create policy locations_employee_update on public.locations
  for update
  using (public.has_permission('locations.edit') or public.has_permission('locations.publish'))
  with check (public.has_permission('locations.edit') or public.has_permission('locations.publish'));

create policy location_images_employee_select on public.location_images
  for select
  using (public.has_permission('locations.edit') or public.has_permission('locations.publish'));
create policy location_images_employee_insert on public.location_images
  for insert with check (public.has_permission('locations.edit'));
create policy location_images_employee_update on public.location_images
  for update using (public.has_permission('locations.edit'))
  with check (public.has_permission('locations.edit'));
create policy location_images_employee_delete on public.location_images
  for delete using (public.has_permission('locations.edit'));

create policy location_faqs_employee_select on public.location_faqs
  for select
  using (public.has_permission('locations.edit') or public.has_permission('locations.publish'));
create policy location_faqs_employee_insert on public.location_faqs
  for insert with check (public.has_permission('locations.edit'));
create policy location_faqs_employee_update on public.location_faqs
  for update using (public.has_permission('locations.edit'))
  with check (public.has_permission('locations.edit'));
create policy location_faqs_employee_delete on public.location_faqs
  for delete using (public.has_permission('locations.edit'));

-- Studios: same split, keyed to studios.edit / studios.publish. No employee
-- DELETE policy.
create policy studios_employee_select on public.studios
  for select
  using (public.has_permission('studios.edit') or public.has_permission('studios.publish'));
create policy studios_employee_insert on public.studios
  for insert
  with check (public.has_permission('studios.edit'));
create policy studios_employee_update on public.studios
  for update
  using (public.has_permission('studios.edit') or public.has_permission('studios.publish'))
  with check (public.has_permission('studios.edit') or public.has_permission('studios.publish'));

create policy studio_images_employee_select on public.studio_images
  for select
  using (public.has_permission('studios.edit') or public.has_permission('studios.publish'));
create policy studio_images_employee_insert on public.studio_images
  for insert with check (public.has_permission('studios.edit'));
create policy studio_images_employee_update on public.studio_images
  for update using (public.has_permission('studios.edit'))
  with check (public.has_permission('studios.edit'));
create policy studio_images_employee_delete on public.studio_images
  for delete using (public.has_permission('studios.edit'));

create policy studio_pricing_options_employee_select on public.studio_pricing_options
  for select
  using (public.has_permission('studios.edit') or public.has_permission('studios.publish'));
create policy studio_pricing_options_employee_insert on public.studio_pricing_options
  for insert with check (public.has_permission('studios.edit'));
create policy studio_pricing_options_employee_update on public.studio_pricing_options
  for update using (public.has_permission('studios.edit'))
  with check (public.has_permission('studios.edit'));
create policy studio_pricing_options_employee_delete on public.studio_pricing_options
  for delete using (public.has_permission('studios.edit'));

create policy studio_faqs_employee_select on public.studio_faqs
  for select
  using (public.has_permission('studios.edit') or public.has_permission('studios.publish'));
create policy studio_faqs_employee_insert on public.studio_faqs
  for insert with check (public.has_permission('studios.edit'));
create policy studio_faqs_employee_update on public.studio_faqs
  for update using (public.has_permission('studios.edit'))
  with check (public.has_permission('studios.edit'));
create policy studio_faqs_employee_delete on public.studio_faqs
  for delete using (public.has_permission('studios.edit'));

-- Cities: find_or_create_city() is SECURITY INVOKER, so a manager creating a
-- location/studio in a new city needs INSERT (new row) and UPDATE (ON
-- CONFLICT DO UPDATE path). Scoped to the edit permissions only.
create policy cities_employee_insert on public.cities
  for insert
  with check (public.has_permission('locations.edit') or public.has_permission('studios.edit'));
create policy cities_employee_update on public.cities
  for update
  using (public.has_permission('locations.edit') or public.has_permission('studios.edit'))
  with check (public.has_permission('locations.edit') or public.has_permission('studios.edit'));

-- ---------------------------------------------------------------------------
-- 3. Permission catalog: replace the coarse *.manage codes with granular ones
-- ---------------------------------------------------------------------------

delete from public.employee_role_permissions
where permission_id in (
  select id from public.employee_permissions
  where code in ('locations.manage', 'studios.manage')
);

delete from public.employee_permissions
where code in ('locations.manage', 'studios.manage');

insert into public.employee_permissions (code, description) values
  ('locations.edit',    'Create and edit locations, including images and FAQs.'),
  ('locations.publish', 'Publish and unpublish locations.'),
  ('studios.edit',      'Create and edit studios, including images, pricing and FAQs.'),
  ('studios.publish',   'Publish and unpublish studios.');

-- content_manager and operations both get edit + publish for locations and
-- studios. Deletion is intentionally granted to NO employee role (admin-only).
insert into public.employee_role_permissions (role_id, permission_id)
select r.id, p.id
from public.employee_roles r
cross join public.employee_permissions p
where r.slug in ('content_manager', 'operations')
  and p.code in ('locations.edit', 'locations.publish', 'studios.edit', 'studios.publish');

-- ---------------------------------------------------------------------------
-- 4. is_published column protection (mirrors protect_photographer_status_fields)
-- ---------------------------------------------------------------------------

create function public.protect_location_publish_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_published is distinct from old.is_published
     and not public.has_permission('locations.publish') then
    raise exception 'You do not have permission to publish or unpublish locations.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger locations_protect_publish_status
  before update on public.locations
  for each row execute function public.protect_location_publish_status();

create function public.protect_studio_publish_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_published is distinct from old.is_published
     and not public.has_permission('studios.publish') then
    raise exception 'You do not have permission to publish or unpublish studios.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger studios_protect_publish_status
  before update on public.studios
  for each row execute function public.protect_studio_publish_status();
