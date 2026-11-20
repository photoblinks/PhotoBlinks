-- AI verification: manual "Start AI Verification" run queue.
--
-- ADDITIVE. Adds columns to ai_maintenance_runs, two new tables (ai_run_locations, ai_cost_reservations)
-- and a set of SECURITY DEFINER functions. Nothing here touches public.locations: proposals are
-- inserted as 'pending' (existing review flow) and a location column still changes only through
-- ai_approve_field_proposal() after a manual approval.
--
-- Rules enforced in the database:
--   * Only administrators can start / resume / pause / cancel / retry a run (is_admin()).
--   * At most ONE active admin-button run (queued = paused, running) at any time: a partial unique
--     index, so concurrent clicks and double submits cannot create duplicate runs.
--   * STRICT per-location spending cap of INR 2 across ALL attempts, kept by a durable COST LEDGER:
--       - before every paid call the worker RESERVES its worst-case cost (ai_reserve_cost); the
--         reservation is refused if confirmed + reserved + new would pass the cap;
--       - right after the call it CONFIRMS the real cost (ai_confirm_cost): recorded immediately,
--         idempotent per reservation, so nothing is counted twice;
--       - a reservation that is never confirmed (killed request, timeout, lost page) is NEVER
--         released: when the attempt is closed (resume, cancel, record, fail) it is charged IN FULL
--         as 'charged_uncertain', and a late confirmation for it is ignored.
--     There is deliberately NO overall budget cap.
--   * Ownership: a location is handed to exactly one session (lease token on run AND item); every
--     reserve / confirm / record / fail call must present that token; a running location cannot be
--     claimed or reset while its attempt could still be alive (deadline 45 s + margin), and the run
--     lease (120 s) outlives the per-location deadline.
--   * No cron / scheduler: a run only exists because an administrator clicked, and it is only
--     driven by calls from that administrator's open page.
--
-- Depends on: public.locations/states/cities/categories, public.is_admin(), public.has_permission(),
-- ai_maintenance_runs / ai_location_verification_history / ai_field_verification_details (20261125).

-- ---------------------------------------------------------------------------
-- Run columns
-- ---------------------------------------------------------------------------

alter table public.ai_maintenance_runs
  add column source text not null default 'legacy' check (source in ('legacy', 'admin_button')),
  add column started_by uuid references auth.users (id) on delete set null,
  add column total_locations integer not null default 0 check (total_locations >= 0),
  add column failed_locations integer not null default 0 check (failed_locations >= 0),
  add column total_cost_inr numeric not null default 0 check (total_cost_inr >= 0),
  add column pause_reason text;

-- One active button run. Scoped to source = 'admin_button' so pre-existing legacy rows can never
-- make this index fail to build.
create unique index ai_maintenance_runs_single_active_button_uidx
  on public.ai_maintenance_runs ((true))
  where source = 'admin_button' and status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- Constants as functions (one place to read them from SQL and tests)
-- ---------------------------------------------------------------------------

create function public.ai_location_cost_cap_inr() returns numeric
language sql immutable as $$ select 2::numeric $$;

-- Below this remaining budget a location cannot finish a useful attempt (one search alone is ~0.42).
create function public.ai_min_attempt_inr() returns numeric
language sql immutable as $$ select 0.5::numeric $$;

create function public.ai_max_attempts() returns integer
language sql immutable as $$ select 2 $$;

-- Hard per-location deadline enforced by the worker (every request is aborted at 45 s).
create function public.ai_attempt_deadline_seconds() returns integer
language sql immutable as $$ select 45 $$;

-- The run lease outlives the deadline more than twice, and is renewed by every reserve / confirm.
create function public.ai_lease_seconds() returns integer
language sql immutable as $$ select 120 $$;

-- A running location is treated as possibly alive for deadline + 30 s margin.
create function public.ai_item_live_seconds() returns integer
language sql immutable as $$ select 75 $$;

-- ---------------------------------------------------------------------------
-- Queue table: one row per location per run
--   cost_inr      = money charged so far: confirmed spend + pessimistic charges (never lowered)
--   reserved_inr  = worst case of paid calls currently in flight (not yet confirmed)
--   uncertain_inr = the part of cost_inr that was charged in full because an attempt was interrupted
-- ---------------------------------------------------------------------------

create table public.ai_run_locations (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.ai_maintenance_runs (id) on delete cascade,
  location_id   uuid not null references public.locations (id) on delete cascade,
  position      integer not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'running', 'done', 'failed', 'budget_exhausted', 'skipped')),
  attempts      integer not null default 0 check (attempts >= 0),
  cost_inr      numeric not null default 0 check (cost_inr >= 0),
  reserved_inr  numeric not null default 0 check (reserved_inr >= 0),
  uncertain_inr numeric not null default 0 check (uncertain_inr >= 0),
  searches      integer not null default 0 check (searches >= 0),
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  history_id    uuid references public.ai_location_verification_history (id) on delete set null,
  lease_token   uuid,
  last_error    text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (run_id, location_id)
);

create index ai_run_locations_queue_idx on public.ai_run_locations (run_id, status, position);

create trigger ai_run_locations_set_updated_at
  before update on public.ai_run_locations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cost ledger: one row per paid call
-- ---------------------------------------------------------------------------

create table public.ai_cost_reservations (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.ai_run_locations (id) on delete cascade,
  kind          text not null check (kind in ('search', 'model')),
  reserved_inr  numeric not null check (reserved_inr > 0),
  actual_inr    numeric check (actual_inr >= 0),
  status        text not null default 'reserved' check (status in ('reserved', 'confirmed', 'charged_uncertain')),
  created_at    timestamptz not null default now(),
  settled_at    timestamptz,
  check ((status = 'reserved') = (actual_inr is null))
);

create index ai_cost_reservations_item_idx on public.ai_cost_reservations (item_id, status);

alter table public.ai_run_locations enable row level security;
alter table public.ai_cost_reservations enable row level security;

create policy ai_run_locations_staff_read on public.ai_run_locations
  for select to authenticated
  using ((select public.has_permission('locations.edit'))
         or (select public.has_permission('locations.publish')));

create policy ai_cost_reservations_staff_read on public.ai_cost_reservations
  for select to authenticated
  using ((select public.has_permission('locations.edit'))
         or (select public.has_permission('locations.publish')));

revoke all on public.ai_run_locations, public.ai_cost_reservations from public, anon, authenticated, service_role;
grant select on public.ai_run_locations, public.ai_cost_reservations to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.ai_require_admin() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can run AI verification.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Charges every reservation of this location that was never confirmed IN FULL (never released) and
-- returns the amount. Called whenever an attempt is closed without a confirmation for every call.
create function public.ai_charge_outstanding(p_item_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sum numeric;
  v_run uuid;
begin
  with charged as (
    update public.ai_cost_reservations
       set status = 'charged_uncertain', actual_inr = reserved_inr, settled_at = now()
     where item_id = p_item_id and status = 'reserved'
    returning reserved_inr
  )
  select coalesce(sum(reserved_inr), 0) into v_sum from charged;

  update public.ai_run_locations
     set cost_inr = cost_inr + v_sum, uncertain_inr = uncertain_inr + v_sum, reserved_inr = 0
   where id = p_item_id
  returning run_id into v_run;

  if v_sum > 0 then
    update public.ai_maintenance_runs set total_cost_inr = total_cost_inr + v_sum where id = v_run;
  end if;
  return v_sum;
end;
$$;

-- Locations that may be queued: live (published) and not verified within p_min_age_days.
create function public.ai_eligible_location_count(p_min_age_days integer default 30)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.locations l
   where (public.has_permission('locations.edit') or public.has_permission('locations.publish'))
     and l.is_published
     and not exists (
       select 1 from public.ai_location_verification_history h
        where h.location_id = l.id and h.result <> 'failed'
          and h.verified_at > now() - make_interval(days => greatest(p_min_age_days, 0)));
$$;

-- ---------------------------------------------------------------------------
-- Start: the ONLY way a run is created. Manual, admin-only, one at a time.
-- ---------------------------------------------------------------------------

create function public.ai_start_run(p_min_age_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   uuid;
  v_lease uuid := gen_random_uuid();
  v_total integer;
begin
  perform public.ai_require_admin();
  if p_min_age_days is null or p_min_age_days < 0 or p_min_age_days > 3650 then
    raise exception 'p_min_age_days must be between 0 and 3650.';
  end if;

  if exists (select 1 from public.ai_maintenance_runs
              where source = 'admin_button' and status in ('queued', 'running')) then
    raise exception 'A verification run is already active. Resume or cancel it before starting another.'
      using errcode = '55000';
  end if;

  insert into public.ai_maintenance_runs
    (run_date, status, source, started_by, locked_by, lease_token, heartbeat_at, lease_expires_at, attempt_count, started_at)
  values
    (current_date, 'running', 'admin_button', auth.uid(), 'admin:' || auth.uid()::text, v_lease, now(),
     now() + make_interval(secs => public.ai_lease_seconds()), 1, now())
  returning id into v_run;

  insert into public.ai_run_locations (run_id, location_id, position)
  select v_run, l.id, (row_number() over (order by l.name, l.id))::int
    from public.locations l
   where l.is_published
     and not exists (
       select 1 from public.ai_location_verification_history h
        where h.location_id = l.id and h.result <> 'failed'
          and h.verified_at > now() - make_interval(days => p_min_age_days));
  get diagnostics v_total = row_count;

  if v_total = 0 then
    raise exception 'No eligible locations: every live location was verified within the last % days.', p_min_age_days
      using errcode = 'P0001';
  end if;

  update public.ai_maintenance_runs set total_locations = v_total where id = v_run;
  return jsonb_build_object('run_id', v_run, 'lease_token', v_lease, 'total', v_total);
exception
  when unique_violation then
    raise exception 'A verification run is already active. Resume or cancel it before starting another.'
      using errcode = '55000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Resume: take over a paused run, or a running one whose page stopped responding.
-- A location whose attempt could still be alive is NEVER taken over; an interrupted one is charged
-- for everything it had in flight before it may be retried.
-- ---------------------------------------------------------------------------

create function public.ai_resume_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.ai_maintenance_runs;
  it      public.ai_run_locations;
  v_lease uuid := gen_random_uuid();
  v_left  integer;
begin
  perform public.ai_require_admin();
  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found then
    raise exception 'Run not found.';
  end if;
  if r.status = 'running' and r.lease_expires_at > now() then
    raise exception 'This run is still active in another session. Resume becomes available if that session stops responding.'
      using errcode = '55000';
  end if;
  if r.status not in ('queued', 'running') then
    raise exception 'This run is already %.', r.status using errcode = '55000';
  end if;
  if exists (select 1 from public.ai_run_locations
              where run_id = p_run_id and status = 'running'
                and started_at > now() - make_interval(secs => public.ai_item_live_seconds())) then
    raise exception 'A location is still being processed. Try again in a minute.' using errcode = '55000';
  end if;

  -- Interrupted locations: charge what was in flight (never released), then retry or close them.
  for it in select * from public.ai_run_locations where run_id = p_run_id and status = 'running' for update loop
    perform public.ai_charge_outstanding(it.id);
    select * into it from public.ai_run_locations where id = it.id;
    if it.attempts >= public.ai_max_attempts() then
      update public.ai_run_locations set status = 'failed', lease_token = null, finished_at = now(),
             last_error = 'Interrupted twice' where id = it.id;
      update public.ai_maintenance_runs set processed_locations = processed_locations + 1 where id = p_run_id;
    elsif public.ai_location_cost_cap_inr() - it.cost_inr < public.ai_min_attempt_inr() then
      update public.ai_run_locations set status = 'budget_exhausted', lease_token = null, finished_at = now(),
             last_error = 'Interrupted; per-location spending cap reached' where id = it.id;
      update public.ai_maintenance_runs set processed_locations = processed_locations + 1 where id = p_run_id;
    else
      update public.ai_run_locations set status = 'pending', lease_token = null,
             last_error = 'Interrupted; retrying with the remaining budget' where id = it.id;
    end if;
  end loop;

  update public.ai_maintenance_runs
     set status = 'running', locked_by = 'admin:' || auth.uid()::text, lease_token = v_lease,
         heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => public.ai_lease_seconds()),
         attempt_count = attempt_count + 1, pause_reason = null,
         failed_locations = (select count(*) from public.ai_run_locations where run_id = p_run_id and status = 'failed')
   where id = p_run_id;

  select count(*)::int into v_left from public.ai_run_locations where run_id = p_run_id and status = 'pending';
  return jsonb_build_object('run_id', p_run_id, 'lease_token', v_lease, 'pending', v_left);
exception
  when unique_violation then
    raise exception 'Another verification run is already active.' using errcode = '55000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Pause (keeps the queue; resumable) and cancel (final)
-- A location already being processed is left alone: it can still confirm and record.
-- ---------------------------------------------------------------------------

create function public.ai_pause_run(p_run_id uuid, p_reason text default 'Paused by an administrator')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.ai_maintenance_runs;
begin
  perform public.ai_require_admin();
  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found then raise exception 'Run not found.'; end if;
  if r.status not in ('queued', 'running') then
    raise exception 'This run is already %.', r.status using errcode = '55000';
  end if;
  update public.ai_maintenance_runs
     set status = 'queued', locked_by = null, lease_token = null, heartbeat_at = null,
         lease_expires_at = null, pause_reason = left(coalesce(p_reason, 'Paused'), 500)
   where id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'status', 'queued');
end;
$$;

create function public.ai_cancel_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r  public.ai_maintenance_runs;
  it record;
begin
  perform public.ai_require_admin();
  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found then raise exception 'Run not found.'; end if;
  if r.status not in ('queued', 'running') then
    raise exception 'This run is already %.', r.status using errcode = '55000';
  end if;
  -- Whatever is in flight is charged in full now (never released); a late confirmation is ignored.
  for it in select id from public.ai_run_locations where run_id = p_run_id and status = 'running' loop
    perform public.ai_charge_outstanding(it.id);
  end loop;
  update public.ai_run_locations set status = 'skipped', finished_at = now()
   where run_id = p_run_id and status = 'pending';
  update public.ai_maintenance_runs
     set status = 'cancelled', locked_by = null, lease_token = null, heartbeat_at = null,
         lease_expires_at = null, finished_at = now()
   where id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim the next location. Returns null when nothing is pending.
-- Only a PENDING location can be claimed, so a running (live) one is never handed out twice.
-- ---------------------------------------------------------------------------

create function public.ai_claim_next_location(p_run_id uuid, p_lease uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         public.ai_maintenance_runs;
  it        public.ai_run_locations;
  loc       record;
  v_remain  numeric;
begin
  perform public.ai_require_admin();
  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found or r.status <> 'running' or r.lease_token is distinct from p_lease or r.lease_expires_at < now() then
    raise exception 'This session no longer holds the run (it was paused, cancelled or taken over).'
      using errcode = '55000';
  end if;
  update public.ai_maintenance_runs
     set heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => public.ai_lease_seconds())
   where id = p_run_id;

  loop
    select * into it from public.ai_run_locations
     where run_id = p_run_id and status = 'pending'
     order by position limit 1 for update skip locked;
    if not found then
      return null;
    end if;

    select l.id, l.name, l.is_published, c.name as city_name, s.name as state_name, cat.name as category,
           l.pre_wedding_shoot, l.prior_booking, l.drone_status, l.drone_permission, l.entry_fee, l.shoot_permit_fee
      into loc
      from public.locations l
      join public.cities c on c.id = l.city_id
      join public.states s on s.id = l.state_id
      left join public.categories cat on cat.id = l.category_id
     where l.id = it.location_id;

    if not found or not loc.is_published then
      update public.ai_run_locations set status = 'skipped', finished_at = now(),
             last_error = 'Location is no longer live' where id = it.id;
      continue;
    end if;

    v_remain := public.ai_location_cost_cap_inr() - it.cost_inr;
    if v_remain < public.ai_min_attempt_inr() then
      update public.ai_run_locations set status = 'budget_exhausted', finished_at = now(),
             last_error = 'Per-location spending cap reached' where id = it.id;
      update public.ai_maintenance_runs set processed_locations = processed_locations + 1 where id = p_run_id;
      continue;
    end if;

    update public.ai_run_locations
       set status = 'running', attempts = attempts + 1, started_at = now(), finished_at = null,
           lease_token = p_lease, reserved_inr = 0
     where id = it.id;

    return jsonb_build_object(
      'item_id', it.id,
      'location_id', loc.id,
      'name', loc.name,
      'city_name', loc.city_name,
      'state_name', loc.state_name,
      'category', loc.category,
      'attempt', it.attempts + 1,
      'remaining_inr', v_remain,
      'deadline_seconds', public.ai_attempt_deadline_seconds(),
      'existing', jsonb_build_object(
        'pre_wedding_shoot', loc.pre_wedding_shoot, 'prior_booking', loc.prior_booking,
        'drone_status', loc.drone_status, 'drone_permission', loc.drone_permission,
        'entry_fee', loc.entry_fee, 'shoot_permit_fee', loc.shoot_permit_fee));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cost ledger: reserve BEFORE a paid call, confirm RIGHT AFTER it.
-- ---------------------------------------------------------------------------

create function public.ai_reserve_cost(p_run_id uuid, p_lease uuid, p_item_id uuid, p_kind text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.ai_maintenance_runs;
  it     public.ai_run_locations;
  v_id   uuid;
  v_cap  numeric := public.ai_location_cost_cap_inr();
begin
  perform public.ai_require_admin();
  if p_kind not in ('search', 'model') then raise exception 'Invalid cost kind.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_cap then raise exception 'Invalid reservation amount.'; end if;

  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  -- No NEW paid call may start unless this session still holds a live run lease.
  if not found or r.status <> 'running' or r.lease_token is distinct from p_lease or r.lease_expires_at < now() then
    raise exception 'This session no longer holds the run.' using errcode = '55000';
  end if;
  select * into it from public.ai_run_locations where id = p_item_id and run_id = p_run_id for update;
  if not found or it.status <> 'running' or it.lease_token is distinct from p_lease then
    raise exception 'This location is not being processed by this session.' using errcode = '55000';
  end if;

  if it.cost_inr + it.reserved_inr + p_amount > v_cap + 0.000001 then
    raise exception 'Per-location spending cap would be exceeded (charged %, in flight %, requested %).',
      round(it.cost_inr, 4), round(it.reserved_inr, 4), round(p_amount, 4) using errcode = 'P0001';
  end if;

  insert into public.ai_cost_reservations (item_id, kind, reserved_inr)
  values (p_item_id, p_kind, p_amount) returning id into v_id;
  update public.ai_run_locations set reserved_inr = reserved_inr + p_amount where id = p_item_id;
  update public.ai_maintenance_runs
     set heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => public.ai_lease_seconds())
   where id = p_run_id;

  return jsonb_build_object('reservation_id', v_id,
    'remaining_inr', v_cap - it.cost_inr - it.reserved_inr - p_amount);
end;
$$;

-- Idempotent: confirming twice, or confirming a reservation that was already charged in full after an
-- interruption, changes nothing (no double counting).
create function public.ai_confirm_cost(p_run_id uuid, p_lease uuid, p_reservation_id uuid, p_actual numeric,
                                       p_input_tokens integer default 0, p_output_tokens integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res public.ai_cost_reservations;
  it  public.ai_run_locations;
begin
  perform public.ai_require_admin();
  if p_actual is null or p_actual < 0 or p_actual > 1000 then raise exception 'Invalid cost.'; end if;

  select * into res from public.ai_cost_reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.' using errcode = '55000'; end if;
  if res.status <> 'reserved' then
    return jsonb_build_object('already', res.status);
  end if;

  select * into it from public.ai_run_locations where id = res.item_id and run_id = p_run_id for update;
  if not found or it.status <> 'running' or it.lease_token is distinct from p_lease then
    raise exception 'This location is not being processed by this session.' using errcode = '55000';
  end if;

  update public.ai_cost_reservations
     set status = 'confirmed', actual_inr = p_actual, settled_at = now()
   where id = p_reservation_id;
  update public.ai_run_locations
     set reserved_inr = greatest(reserved_inr - res.reserved_inr, 0),
         cost_inr = cost_inr + p_actual,
         searches = searches + case when res.kind = 'search' then 1 else 0 end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0)
   where id = res.item_id;
  update public.ai_maintenance_runs
     set total_cost_inr = total_cost_inr + p_actual,
         heartbeat_at = case when status = 'running' then now() else heartbeat_at end,
         lease_expires_at = case when status = 'running' then now() + make_interval(secs => public.ai_lease_seconds()) else lease_expires_at end
   where id = p_run_id;

  return jsonb_build_object('item_cost_inr', it.cost_inr + p_actual);
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a finished location: history row + PENDING proposals. Never writes to locations.
-- Money is NOT taken from p_result: it is already in the ledger (confirmed or charged in full).
--
-- p_result = { model, confidence, summary, source_urls: [text], verified_count, cost_inr (informational),
--              proposals: [{ field, proposed_value, evidence, source_urls: [text], confidence }] }
-- Proposals are re-validated here and silently dropped unless they are real: a known field, a
-- non-empty value that is not unknown/unverified/null, a valid enum value, non-empty evidence, at
-- least one https source, and different from the CURRENT location value.
-- ---------------------------------------------------------------------------

create function public.ai_record_location_result(p_run_id uuid, p_lease uuid, p_item_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.ai_maintenance_runs;
  it       public.ai_run_locations;
  p        jsonb;
  v_field  text;
  v_value  text;
  v_cur    text;
  v_valid  jsonb := '[]'::jsonb;
  v_result text;
  v_hist   uuid;
  v_urls   text[];
  v_verified integer := coalesce((p_result ->> 'verified_count')::integer, 0);
  v_conf   numeric := nullif(p_result ->> 'confidence', '')::numeric;
  v_note   text;
  v_reported numeric := coalesce((p_result ->> 'cost_inr')::numeric, 0);
begin
  perform public.ai_require_admin();

  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found or r.status not in ('running', 'queued', 'cancelled') then
    raise exception 'Run not found or finished.' using errcode = '55000';
  end if;
  select * into it from public.ai_run_locations
   where id = p_item_id and run_id = p_run_id for update;
  if not found or it.status <> 'running' or it.lease_token is distinct from p_lease then
    raise exception 'This location is not being processed by this session.' using errcode = '55000';
  end if;

  -- Anything still in flight when the attempt is closed is charged in full (never released).
  perform public.ai_charge_outstanding(p_item_id);
  select * into it from public.ai_run_locations where id = p_item_id;

  for p in select * from jsonb_array_elements(coalesce(p_result -> 'proposals', '[]'::jsonb)) loop
    v_field := p ->> 'field';
    v_value := btrim(coalesce(p ->> 'proposed_value', ''));
    if v_field not in ('pre_wedding_shoot', 'prior_booking', 'drone_status', 'drone_permission', 'entry_fee', 'shoot_permit_fee') then continue; end if;
    if v_value = '' or length(v_value) > 2000 or lower(v_value) in ('unverified', 'unknown', 'null', 'n/a') then continue; end if;
    if v_field = 'pre_wedding_shoot' and v_value not in ('allowed', 'conditional', 'prohibited') then continue; end if;
    if v_field = 'drone_status' and v_value not in ('allowed', 'allowed_with_permission', 'restricted', 'prohibited') then continue; end if;
    if btrim(coalesce(p ->> 'evidence', '')) = '' then continue; end if;
    select coalesce(array_agg(u), '{}') into v_urls
      from jsonb_array_elements_text(coalesce(p -> 'source_urls', '[]'::jsonb)) u where u like 'https://%';
    if coalesce(array_length(v_urls, 1), 0) = 0 then continue; end if;

    execute format('select %I from public.locations where id = $1', v_field) into v_cur using it.location_id;
    if v_cur is not null and lower(btrim(v_cur)) = lower(v_value) then continue; end if; -- nothing to change

    v_valid := v_valid || jsonb_build_array(p || jsonb_build_object('current_value', v_cur, 'urls', to_jsonb(v_urls)));
  end loop;

  v_result := case
    when jsonb_array_length(v_valid) > 0 then 'changes_found'
    when v_verified > 0 then 'verified_ok'
    else 'inconclusive' end;

  select coalesce(array_agg(u), '{}') into v_urls
    from jsonb_array_elements_text(coalesce(p_result -> 'source_urls', '[]'::jsonb)) u where u like 'https://%';

  insert into public.ai_location_verification_history
    (location_id, run_id, result, confidence, summary, source_urls, model, is_latest,
     input_tokens, output_tokens, grounding_queries, estimated_cost_inr)
  values
    (it.location_id, p_run_id, v_result, least(greatest(coalesce(v_conf, 0), 0), 1),
     left(p_result ->> 'summary', 2000), v_urls, left(p_result ->> 'model', 200),
     v_result in ('verified_ok', 'changes_found'),
     it.input_tokens, it.output_tokens, it.searches, it.cost_inr)
  returning id into v_hist;

  for p in select * from jsonb_array_elements(v_valid) loop
    insert into public.ai_field_verification_details
      (verification_history_id, field_name, current_value, proposed_value, verification_status,
       grounded_evidence, source_urls, confidence, review_status)
    values
      (v_hist, p ->> 'field', p ->> 'current_value', btrim(p ->> 'proposed_value'), 'verified',
       left(p ->> 'evidence', 2000),
       array(select jsonb_array_elements_text(p -> 'urls')),
       least(greatest(coalesce(nullif(p ->> 'confidence', '')::numeric, v_conf, 0), 0), 1),
       'pending');
  end loop;

  if it.cost_inr > public.ai_location_cost_cap_inr() + 0.0001 then
    v_note := format('Per-location cap exceeded by INR %s (estimate drift)', round(it.cost_inr - public.ai_location_cost_cap_inr(), 4));
  elsif v_reported > it.cost_inr + 0.01 then
    v_note := format('Reported spend INR %s is above the ledger INR %s', round(v_reported, 4), round(it.cost_inr, 4));
  end if;

  update public.ai_run_locations
     set status = 'done', history_id = v_hist, finished_at = now(), last_error = v_note, lease_token = null
   where id = p_item_id;

  update public.ai_maintenance_runs
     set processed_locations = processed_locations + 1,
         heartbeat_at = case when status = 'running' then now() else heartbeat_at end,
         lease_expires_at = case when status = 'running' then now() + make_interval(secs => public.ai_lease_seconds()) else lease_expires_at end
   where id = p_run_id;

  return jsonb_build_object('history_id', v_hist, 'result', v_result, 'proposals_created', jsonb_array_length(v_valid),
                            'item_cost_inr', it.cost_inr,
                            'run_total_cost_inr', (select total_cost_inr from public.ai_maintenance_runs where id = p_run_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Failure of one location. Retried once more if attempts and the REMAINING per-location budget allow
-- (everything in flight is charged first); the run continues with the next location either way.
-- ---------------------------------------------------------------------------

create function public.ai_fail_location(p_run_id uuid, p_lease uuid, p_item_id uuid, p_error text,
                                        p_retry boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.ai_maintenance_runs;
  it       public.ai_run_locations;
  v_retry  boolean;
begin
  perform public.ai_require_admin();

  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found or r.status not in ('running', 'queued', 'cancelled') then
    raise exception 'Run not found or finished.' using errcode = '55000';
  end if;
  select * into it from public.ai_run_locations
   where id = p_item_id and run_id = p_run_id for update;
  if not found or it.status <> 'running' or it.lease_token is distinct from p_lease then
    raise exception 'This location is not being processed by this session.' using errcode = '55000';
  end if;

  perform public.ai_charge_outstanding(p_item_id);
  select * into it from public.ai_run_locations where id = p_item_id;

  v_retry := coalesce(p_retry, true)
             and it.attempts < public.ai_max_attempts()
             and (public.ai_location_cost_cap_inr() - it.cost_inr) >= public.ai_min_attempt_inr();

  if v_retry then
    update public.ai_run_locations
       set status = 'pending', last_error = left(p_error, 500), lease_token = null
     where id = p_item_id;
  else
    update public.ai_run_locations
       set status = 'failed', last_error = left(p_error, 500), finished_at = now(), lease_token = null
     where id = p_item_id;
    insert into public.ai_location_verification_history (location_id, run_id, result, summary, estimated_cost_inr, is_latest,
                                                         input_tokens, output_tokens, grounding_queries)
    values (it.location_id, p_run_id, 'failed', left(p_error, 500), it.cost_inr, false,
            it.input_tokens, it.output_tokens, it.searches);
  end if;

  update public.ai_maintenance_runs
     set processed_locations = processed_locations + case when v_retry then 0 else 1 end,
         failed_locations = failed_locations + case when v_retry then 0 else 1 end,
         last_error = left(p_error, 500),
         heartbeat_at = case when status = 'running' then now() else heartbeat_at end,
         lease_expires_at = case when status = 'running' then now() + make_interval(secs => public.ai_lease_seconds()) else lease_expires_at end
   where id = p_run_id;

  return jsonb_build_object('will_retry', v_retry, 'item_cost_inr', it.cost_inr);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finish, and retry the failed ones (manual).
-- ---------------------------------------------------------------------------

create function public.ai_finish_run(p_run_id uuid, p_lease uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.ai_maintenance_runs;
begin
  perform public.ai_require_admin();
  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found or r.status <> 'running' or r.lease_token is distinct from p_lease then
    raise exception 'This session no longer holds the run.' using errcode = '55000';
  end if;
  if exists (select 1 from public.ai_run_locations where run_id = p_run_id and status in ('pending', 'running')) then
    raise exception 'The run still has locations to process.' using errcode = '55000';
  end if;
  update public.ai_maintenance_runs
     set status = 'succeeded', locked_by = null, lease_token = null, heartbeat_at = null,
         lease_expires_at = null, finished_at = now(), pause_reason = null
   where id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'status', 'succeeded', 'total_cost_inr', r.total_cost_inr);
end;
$$;

create function public.ai_retry_failed_locations(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.ai_maintenance_runs;
  v_lease uuid := gen_random_uuid();
  v_n     integer;
begin
  perform public.ai_require_admin();
  select * into r from public.ai_maintenance_runs
   where id = p_run_id and source = 'admin_button' for update;
  if not found then raise exception 'Run not found.'; end if;
  if r.status not in ('succeeded', 'queued') then
    raise exception 'Failed locations can only be retried on a finished or paused run.' using errcode = '55000';
  end if;

  -- Only locations that still have per-location budget left are retried (charges are never lowered).
  update public.ai_run_locations
     set status = 'pending', attempts = 0, last_error = null, finished_at = null, lease_token = null
   where run_id = p_run_id and status = 'failed'
     and (public.ai_location_cost_cap_inr() - cost_inr) >= public.ai_min_attempt_inr();
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'No failed location has per-location budget left to retry.' using errcode = 'P0001';
  end if;

  update public.ai_maintenance_runs
     set status = 'running', source = 'admin_button', locked_by = 'admin:' || auth.uid()::text, lease_token = v_lease,
         heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => public.ai_lease_seconds()),
         attempt_count = attempt_count + 1, finished_at = null, pause_reason = null,
         processed_locations = processed_locations - v_n,
         failed_locations = (select count(*) from public.ai_run_locations where run_id = p_run_id and status = 'failed')
   where id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'lease_token', v_lease, 'pending', v_n);
exception
  when unique_violation then
    raise exception 'Another verification run is already active.' using errcode = '55000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Progress summary for the admin page (counts by status, cost, proposals created).
-- Read-only; staff with location access only (zeros otherwise).
-- ---------------------------------------------------------------------------

create function public.ai_run_progress(p_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending',          count(*) filter (where status = 'pending'),
    'running',          count(*) filter (where status = 'running'),
    'done',             count(*) filter (where status = 'done'),
    'failed',           count(*) filter (where status = 'failed'),
    'budget_exhausted', count(*) filter (where status = 'budget_exhausted'),
    'skipped',          count(*) filter (where status = 'skipped'),
    'cost_inr',         coalesce(sum(cost_inr), 0),
    'reserved_inr',     coalesce(sum(reserved_inr), 0),
    'uncertain_inr',    coalesce(sum(uncertain_inr), 0),
    'proposals',        (select count(*) from public.ai_field_verification_details d
                           join public.ai_location_verification_history h on h.id = d.verification_history_id
                          where h.run_id = p_run_id
                            and (public.has_permission('locations.edit') or public.has_permission('locations.publish'))))
    from public.ai_run_locations
   where run_id = p_run_id
     and (public.has_permission('locations.edit') or public.has_permission('locations.publish'));
$$;

-- ---------------------------------------------------------------------------
-- Grants: administrators call these through the normal authenticated client; each function
-- re-checks is_admin() itself. Internal helpers are not exposed.
-- ---------------------------------------------------------------------------

revoke all on function public.ai_require_admin() from public, anon, authenticated;
revoke all on function public.ai_charge_outstanding(uuid) from public, anon, authenticated;
revoke all on function public.ai_eligible_location_count(integer),
                      public.ai_start_run(integer),
                      public.ai_resume_run(uuid),
                      public.ai_pause_run(uuid, text),
                      public.ai_cancel_run(uuid),
                      public.ai_claim_next_location(uuid, uuid),
                      public.ai_reserve_cost(uuid, uuid, uuid, text, numeric),
                      public.ai_confirm_cost(uuid, uuid, uuid, numeric, integer, integer),
                      public.ai_record_location_result(uuid, uuid, uuid, jsonb),
                      public.ai_fail_location(uuid, uuid, uuid, text, boolean),
                      public.ai_finish_run(uuid, uuid),
                      public.ai_retry_failed_locations(uuid),
                      public.ai_run_progress(uuid)
  from public, anon;
grant execute on function public.ai_eligible_location_count(integer),
                          public.ai_start_run(integer),
                          public.ai_resume_run(uuid),
                          public.ai_pause_run(uuid, text),
                          public.ai_cancel_run(uuid),
                          public.ai_claim_next_location(uuid, uuid),
                          public.ai_reserve_cost(uuid, uuid, uuid, text, numeric),
                          public.ai_confirm_cost(uuid, uuid, uuid, numeric, integer, integer),
                          public.ai_record_location_result(uuid, uuid, uuid, jsonb),
                          public.ai_fail_location(uuid, uuid, uuid, text, boolean),
                          public.ai_finish_run(uuid, uuid),
                          public.ai_retry_failed_locations(uuid),
                          public.ai_run_progress(uuid)
  to authenticated;
