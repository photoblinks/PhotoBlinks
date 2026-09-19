-- Phase 3: integrate employee permissions into the existing admin modules
-- (locations.manage, studios.manage) and establish the authorization
-- foundation for future modules (dashboard.view, activity.view).
--
-- Purely additive: no existing policy is altered or dropped. The legacy
-- is_admin() policies remain exactly as they are; every change here ADDS a
-- second, permission-scoped policy alongside them, so legacy admins keep
-- their existing access and employees gain access only where their role
-- explicitly grants it.

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- is_employee(): mirrors is_admin()/is_photographer() — security definer so
-- the admin login gate and shell layout can ask "is this user any kind of
-- staff member?" without the caller being able to read the (admin-only)
-- employees table directly.
create function public.is_employee()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.employees
    where user_id = auth.uid()
      and is_active = true
  );
$$;

grant execute on function public.is_employee() to authenticated;

-- get_my_permissions(): the calling session's effective permission codes for
-- an ACTIVE employee (empty if the caller is not one). Used by the reusable
-- server-side guard to decide which modules to surface. Admins are handled
-- separately in the guard (they implicitly have every permission), so this
-- function only needs to reflect the employees table.
create function public.get_my_permissions()
returns setof text
language sql
security definer
stable
set search_path = public
as $$
  select p.code
  from public.employees e
  join public.employee_role_permissions erp on erp.role_id = e.role_id
  join public.employee_permissions p on p.id = erp.permission_id
  where e.user_id = auth.uid()
    and e.is_active = true
  order by p.code;
$$;

grant execute on function public.get_my_permissions() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — Locations module (locations.manage)
-- ---------------------------------------------------------------------------

create policy locations_employee_manage on public.locations
  for all
  using (public.has_permission('locations.manage'))
  with check (public.has_permission('locations.manage'));

create policy location_images_employee_manage on public.location_images
  for all
  using (public.has_permission('locations.manage'))
  with check (public.has_permission('locations.manage'));

create policy location_faqs_employee_manage on public.location_faqs
  for all
  using (public.has_permission('locations.manage'))
  with check (public.has_permission('locations.manage'));

-- ---------------------------------------------------------------------------
-- Row Level Security — Studios module (studios.manage)
-- ---------------------------------------------------------------------------

create policy studios_employee_manage on public.studios
  for all
  using (public.has_permission('studios.manage'))
  with check (public.has_permission('studios.manage'));

create policy studio_images_employee_manage on public.studio_images
  for all
  using (public.has_permission('studios.manage'))
  with check (public.has_permission('studios.manage'));

create policy studio_pricing_options_employee_manage on public.studio_pricing_options
  for all
  using (public.has_permission('studios.manage'))
  with check (public.has_permission('studios.manage'));

create policy studio_faqs_employee_manage on public.studio_faqs
  for all
  using (public.has_permission('studios.manage'))
  with check (public.has_permission('studios.manage'));

-- ---------------------------------------------------------------------------
-- Cities: the location/studio create flow resolves a typed city name through
-- find_or_create_city(), which is SECURITY INVOKER. INSERT covers a brand-new
-- city; UPDATE covers the ON CONFLICT DO UPDATE path for an existing one. Both
-- are scoped to the two manager permissions, never to plain employees.
-- SELECT stays covered by cities_public_read (active cities only), which is
-- all the location/studio forms and filters need.
-- ---------------------------------------------------------------------------

create policy cities_employee_insert on public.cities
  for insert
  with check (
    public.has_permission('locations.manage') or public.has_permission('studios.manage')
  );

create policy cities_employee_update on public.cities
  for update
  using (
    public.has_permission('locations.manage') or public.has_permission('studios.manage')
  )
  with check (
    public.has_permission('locations.manage') or public.has_permission('studios.manage')
  );
