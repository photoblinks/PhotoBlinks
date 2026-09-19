-- Phase 2: Employee Management System — employee records, roles, and
-- granular permissions for future page-specific access control.
--
-- This is a NEW access-grant layer kept deliberately separate from the legacy
-- public.admins / is_admin() system. is_admin() is untouched and remains
-- authoritative for every existing admin route; it also takes precedence in
-- has_permission() below, so a legacy admin always passes every permission
-- check while employees only pass checks their role actually grants.
--
-- Purely additive: no existing table, function, trigger, or policy is altered.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.employee_roles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique check (name = btrim(name) and char_length(name) between 1 and 80),
  slug        text        not null unique check (slug ~ '^[a-z0-9_]+$'),
  description text,
  created_at  timestamptz not null default now()
);

create table public.employee_permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text
);

create table public.employee_role_permissions (
  role_id       uuid not null references public.employee_roles (id) on delete cascade,
  permission_id uuid not null references public.employee_permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.employees (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users (id) on delete cascade,
  -- on delete restrict: a role in use cannot be silently dropped, which
  -- would otherwise orphan employees' access grants.
  role_id    uuid        not null references public.employee_roles (id) on delete restrict,
  full_name  text,
  is_active  boolean     not null default true,
  invited_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employees_role_id_idx on public.employees (role_id);
create index employees_is_active_idx on public.employees (is_active);

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: permission catalog + default roles
-- ---------------------------------------------------------------------------

insert into public.employee_permissions (code, description) values
  ('locations.manage', 'Create, edit, publish and delete locations.'),
  ('studios.manage',   'Create, edit, publish and delete studios.'),
  ('dashboard.view',   'View the Data Dashboard.'),
  ('activity.view',    'View activity tracking.');

insert into public.employee_roles (name, slug, description) values
  ('Content Manager', 'content_manager', 'Manages locations and studios.'),
  ('Analyst',         'analyst',         'View-only access to the Data Dashboard and activity tracking.'),
  ('Operations',      'operations',      'Full operational access: locations, studios, dashboard and activity.');

insert into public.employee_role_permissions (role_id, permission_id)
select r.id, p.id
from public.employee_roles r
cross join public.employee_permissions p
where r.slug = 'content_manager' and p.code in ('locations.manage', 'studios.manage');

insert into public.employee_role_permissions (role_id, permission_id)
select r.id, p.id
from public.employee_roles r
cross join public.employee_permissions p
where r.slug = 'analyst' and p.code in ('dashboard.view', 'activity.view');

insert into public.employee_role_permissions (role_id, permission_id)
select r.id, p.id
from public.employee_roles r
cross join public.employee_permissions p
where r.slug = 'operations';

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- has_permission(p_code): single source of truth for future page-specific
-- authorization. True for any legacy admin (is_admin()), or for an active
-- employee whose role includes the permission. SECURITY DEFINER so it can
-- read employees / employee_role_permissions regardless of the caller's RLS
-- context; it only ever reports about the calling session's own auth.uid().
create function public.has_permission(p_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.employees e
      join public.employee_role_permissions erp on erp.role_id = e.role_id
      join public.employee_permissions p on p.id = erp.permission_id
      where e.user_id = auth.uid()
        and e.is_active
        and p.code = p_code
    );
$$;

grant execute on function public.has_permission(text) to authenticated;

-- admin_find_user_by_email: resolves an existing auth.users id by email so
-- provisioning can link an employee record to an already-registered account
-- (e.g. a legacy admin) instead of failing the invite. Same explicit
-- is_admin() self-guard + security-definer pattern as the other admin RPCs.
create function public.admin_find_user_by_email(p_email text)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select id
  into result
  from auth.users
  where lower(email) = lower(trim(p_email))
  order by created_at
  limit 1;

  return result;
end;
$$;

grant execute on function public.admin_find_user_by_email(text) to authenticated;

-- get_admin_employees / get_admin_employees_count: paginated admin listing
-- that joins the auth user's email and the role name. Same shape and guard
-- as get_admin_location_reports (security definer, explicit is_admin check).
create function public.get_admin_employees(
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
    u.email,
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

grant execute on function public.get_admin_employees(boolean, text, int, int) to authenticated;

create function public.get_admin_employees_count(
  p_active boolean default null,
  p_search text default null
)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from public.employees e
  join auth.users u on u.id = e.user_id
  where (p_active is null or e.is_active = p_active)
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or coalesce(e.full_name, '') ilike '%' || p_search || '%'
    );

  return result;
end;
$$;

grant execute on function public.get_admin_employees_count(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.employee_roles enable row level security;
alter table public.employee_permissions enable row level security;
alter table public.employee_role_permissions enable row level security;
alter table public.employees enable row level security;

-- All four tables are admin-only via the same is_admin() gate as every other
-- admin table. There is deliberately NO self-insert or self-update policy on
-- employees: only an admin can create an employee record or change a role,
-- which is exactly what prevents a user from assigning a role to themselves.
-- Non-admin employees cannot read or write these tables at all; their access
-- flows exclusively through has_permission() above.

create policy employee_roles_admin_all on public.employee_roles
  for all using (public.is_admin()) with check (public.is_admin());

create policy employee_permissions_admin_all on public.employee_permissions
  for all using (public.is_admin()) with check (public.is_admin());

create policy employee_role_permissions_admin_all on public.employee_role_permissions
  for all using (public.is_admin()) with check (public.is_admin());

create policy employees_admin_all on public.employees
  for all using (public.is_admin()) with check (public.is_admin());
