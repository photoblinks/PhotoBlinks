-- Phase 2: photographer_profiles — account-linked photographer identity.
-- Distinct from public.sponsored_photographers (admin-managed paid placements).
-- Do not merge the two tables.

create table public.photographer_profiles (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null unique references auth.users (id) on delete restrict,
  display_name    text        not null,
  bio             text,
  phone_number    text        not null,
  whatsapp_number text,
  instagram_url   text,
  portfolio_url   text,
  avatar_url      text,
  is_active       boolean     not null default true,
  suspended_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- on delete restrict: prevents deleting an auth.users row while a photographer
-- profile exists. Future photo-submission rows will FK to photographer_profiles,
-- so a cascade here would silently destroy submission ownership records. RESTRICT
-- forces explicit cleanup order: submissions first, then profile, then auth user.

create index photographer_profiles_user_id_idx on public.photographer_profiles (user_id);

create trigger photographer_profiles_set_updated_at
  before update on public.photographer_profiles
  for each row execute function public.set_updated_at();

-- is_photographer(): mirrors is_admin() — security definer so it can read
-- photographer_profiles regardless of the caller's RLS context.
create function public.is_photographer()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.photographer_profiles
    where user_id = auth.uid()
      and is_active = true
  );
$$;

-- RLS alone cannot prevent mutations to specific columns, so a trigger guards
-- is_active and suspended_at against non-admin writes. Runs as security invoker
-- (the default) so auth.uid() / is_admin() still reflect the authenticated caller.
create function public.protect_photographer_status_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    if (new.is_active is distinct from old.is_active)
       or (new.suspended_at is distinct from old.suspended_at) then
      raise exception 'is_active and suspended_at can only be modified by an admin.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger photographer_profiles_protect_status
  before update on public.photographer_profiles
  for each row execute function public.protect_photographer_status_fields();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.photographer_profiles enable row level security;

-- Photographer: read own profile.
create policy photographer_profiles_own_read on public.photographer_profiles
  for select
  using (user_id = auth.uid());

-- Photographer: create own profile during onboarding.
-- user_id = auth.uid() in WITH CHECK prevents inserting on behalf of another user.
create policy photographer_profiles_own_insert on public.photographer_profiles
  for insert
  with check (user_id = auth.uid());

-- Photographer: update own profile.
-- Status fields (is_active, suspended_at) are additionally guarded by the
-- protect_photographer_status_fields trigger above.
create policy photographer_profiles_own_update on public.photographer_profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin: full access.
create policy photographer_profiles_admin_all on public.photographer_profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());
