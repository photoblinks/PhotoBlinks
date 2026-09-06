-- Phase 17B: state-wise Sponsored Photographer system. One admin-assigned
-- photographer per Indian state; automatically shown on every published
-- location page in that state (relationship is Photographer -> State, never
-- Photographer -> Location). Purely additive — does not touch locations,
-- studios, drone_status, or any existing SEO table/column.

create table public.sponsored_photographers (
  id uuid primary key default gen_random_uuid(),
  photography_name text not null,
  image_url text not null,
  title text not null,
  description text,
  phone_number text not null,
  whatsapp_number text not null,
  state_id uuid not null references public.states (id) on delete restrict,
  expiry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sponsored_photographers_state_id_idx on public.sponsored_photographers (state_id);

create trigger sponsored_photographers_set_updated_at
  before update on public.sponsored_photographers
  for each row execute function public.set_updated_at();

-- "At most one ACTIVE (expiry_date >= current_date) photographer per state."
-- Postgres partial unique indexes require an IMMUTABLE predicate, and
-- current_date is only STABLE, so this can't be expressed as a partial
-- unique index. Enforced instead via a trigger that first locks the target
-- state row (serializing any concurrent writes for that state, so two
-- concurrent inserts/updates for the same state can't both pass the check)
-- and then rejects the write if another active row already exists.
create function public.check_sponsored_photographer_state_uniqueness()
returns trigger
language plpgsql
as $$
begin
  perform 1 from public.states where id = new.state_id for update;

  if new.expiry_date >= current_date and exists (
    select 1 from public.sponsored_photographers
    where state_id = new.state_id
      and expiry_date >= current_date
      and id <> new.id
  ) then
    raise exception 'An active sponsored photographer already exists for this state.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

create trigger sponsored_photographers_state_uniqueness
  before insert or update on public.sponsored_photographers
  for each row execute function public.check_sponsored_photographer_state_uniqueness();

alter table public.sponsored_photographers enable row level security;

-- Public reads only ever see the active (non-expired) row for a state, and
-- the uniqueness trigger guarantees at most one — so the public lookup is a
-- plain `where state_id = :id`, no client-side date filtering needed.
create policy sponsored_photographers_public_read on public.sponsored_photographers
  for select using (expiry_date >= current_date);

create policy sponsored_photographers_admin_all on public.sponsored_photographers
  for all using (public.is_admin()) with check (public.is_admin());
