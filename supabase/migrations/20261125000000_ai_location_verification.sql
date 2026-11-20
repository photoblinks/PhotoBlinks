-- AI location verification: proposals stored beside the locations they describe.
--
-- Deploys ai_maintenance_runs, ai_location_verification_history and
-- ai_field_verification_details into the main database so the admin approval
-- page (/admin/ai-verification) can read them through the normal RLS client
-- and history can hold a real foreign key to locations.
--
-- Human approval is mandatory: the AI worker only ever INSERTs proposals; a
-- location column changes only through ai_approve_field_proposal(), which
-- requires locations.publish.
--
-- Depends on existing: public.locations, public.is_admin(),
-- public.has_permission(text), public.set_updated_at(), public.activity_events,
-- auth.users.

-- ---------------------------------------------------------------------------
-- Audit-table guard functions
-- ---------------------------------------------------------------------------

create function public.ai_verification_mark_latest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_latest then
    update public.ai_location_verification_history
       set is_latest = false
     where location_id = new.location_id and is_latest;
  end if;
  return new;
end;
$$;

create function public.ai_verification_history_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.id, new.location_id, new.verified_at, new.result, new.confidence,
      new.summary, new.source_urls, new.model, new.created_at)
     is distinct from
     (old.id, old.location_id, old.verified_at, old.result, old.confidence,
      old.summary, old.source_urls, old.model, old.created_at) then
    raise exception 'verification history is append-only';
  end if;
  if new.run_id is distinct from old.run_id and new.run_id is not null then
    raise exception 'verification history run link can only be cleared';
  end if;
  if new.is_latest and not old.is_latest then
    raise exception 'is_latest cannot be re-promoted';
  end if;
  return new;
end;
$$;

-- History rows are audit records and are never deleted while their location
-- exists. The FK to locations is ON DELETE RESTRICT (see below), so a location
-- with AI history cannot be hard-deleted either; unpublish it instead.
create function public.ai_audit_no_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.locations where id = old.location_id) then
    raise exception '% rows are audit history and cannot be deleted while their location exists',
      tg_table_name;
  end if;
  return old;
end;
$$;

create function public.ai_audit_no_truncate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is an audit table; TRUNCATE is not permitted', tg_table_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- ai_maintenance_runs  (no unique run_date: several runs per day are kept)
-- ---------------------------------------------------------------------------

create table public.ai_maintenance_runs (
  id                uuid primary key default gen_random_uuid(),
  run_date          date not null,
  status            text not null default 'queued'
                      check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  locked_by         text,
  lease_token       uuid,
  heartbeat_at      timestamptz,
  lease_expires_at  timestamptz,
  attempt_count     integer not null default 0,
  max_attempts      integer not null default 3 check (max_attempts > 0),
  checkpoint        jsonb not null default '{}'::jsonb,
  processed_locations integer not null default 0,
  processed_cities  integer not null default 0,
  last_error        text,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status <> 'running'
         or (locked_by is not null and lease_expires_at is not null
             and heartbeat_at is not null and lease_token is not null))
);

create index ai_maintenance_runs_claim_idx
  on public.ai_maintenance_runs (run_date)
  where status in ('queued', 'running');

create trigger ai_maintenance_runs_set_updated_at
  before update on public.ai_maintenance_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_location_verification_history
-- ---------------------------------------------------------------------------

create table public.ai_location_verification_history (
  id                 uuid primary key default gen_random_uuid(),
  location_id        uuid not null references public.locations (id) on delete restrict,
  run_id             uuid references public.ai_maintenance_runs (id) on delete set null,
  verified_at        timestamptz not null default now(),
  result             text not null
                       check (result in ('verified_ok', 'changes_found', 'inconclusive', 'failed')),
  confidence         numeric check (confidence >= 0 and confidence <= 1),
  summary            text,
  source_urls        text[] not null default '{}',
  model              text,
  is_latest          boolean not null default false,
  created_at         timestamptz not null default now(),
  input_tokens       integer,
  output_tokens      integer,
  grounding_queries  integer,
  estimated_cost_usd numeric,
  estimated_cost_inr numeric,
  execution_time_ms  integer,
  check (not is_latest or result in ('verified_ok', 'changes_found'))
);

create unique index ai_location_verification_latest_uidx
  on public.ai_location_verification_history (location_id) where is_latest;
create index ai_location_verification_loc_time_idx
  on public.ai_location_verification_history (location_id, verified_at desc);
create index ai_location_verification_run_idx
  on public.ai_location_verification_history (run_id);

create trigger ai_location_verification_mark_latest
  before insert on public.ai_location_verification_history
  for each row execute function public.ai_verification_mark_latest();
create trigger ai_verification_history_guard
  before update on public.ai_location_verification_history
  for each row execute function public.ai_verification_history_guard();
create trigger ai_verification_history_no_delete
  before delete on public.ai_location_verification_history
  for each row execute function public.ai_audit_no_delete();
create trigger ai_verification_history_no_truncate
  before truncate on public.ai_location_verification_history
  for each statement execute function public.ai_audit_no_truncate();

-- ---------------------------------------------------------------------------
-- ai_field_verification_details  (one proposal per verified field)
-- ---------------------------------------------------------------------------

create table public.ai_field_verification_details (
  id                      uuid primary key default gen_random_uuid(),
  verification_history_id uuid not null
                            references public.ai_location_verification_history (id) on delete cascade,
  field_name              text not null check (field_name in (
                            'pre_wedding_shoot', 'prior_booking', 'drone_status',
                            'drone_permission', 'entry_fee', 'shoot_permit_fee')),
  current_value           text,
  proposed_value          text not null,
  verification_status     text not null check (verification_status in ('verified', 'unverified')),
  grounded_evidence       text,
  source_urls             text[] not null default '{}',
  confidence              numeric check (confidence >= 0 and confidence <= 1),
  review_status           text not null default 'pending'
                            check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by             uuid references auth.users (id) on delete set null,
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (verification_history_id, field_name)
);

create index ai_field_verification_details_history_idx
  on public.ai_field_verification_details (verification_history_id);
create index ai_field_verification_details_review_status_idx
  on public.ai_field_verification_details (review_status);
create index ai_field_verification_details_field_name_idx
  on public.ai_field_verification_details (field_name);

create trigger ai_field_verification_details_set_updated_at
  before update on public.ai_field_verification_details
  for each row execute function public.set_updated_at();

-- Column-level restriction for reviewers (RLS cannot compare OLD/NEW). Admins
-- may change anything; locations.publish holders may change only the review
-- columns (updated_at is stamped by set_updated_at and deliberately not compared).
create function public.enforce_ai_field_verification_update_restrictions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if not public.has_permission('locations.publish') then
    raise exception 'Insufficient privilege: locations.publish permission required'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.id, new.verification_history_id, new.field_name, new.current_value,
      new.proposed_value, new.verification_status, new.grounded_evidence,
      new.source_urls, new.confidence, new.created_at)
     is distinct from
     (old.id, old.verification_history_id, old.field_name, old.current_value,
      old.proposed_value, old.verification_status, old.grounded_evidence,
      old.source_urls, old.confidence, old.created_at) then
    raise exception 'Only review_status, reviewed_by and reviewed_at can be changed'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger enforce_ai_field_verification_update_restrictions
  before update on public.ai_field_verification_details
  for each row execute function public.enforce_ai_field_verification_update_restrictions();

-- ---------------------------------------------------------------------------
-- RLS + grants. Reviewers need locations.publish alone (no locations.edit).
-- has_permission() already returns true for admins.
-- ---------------------------------------------------------------------------

alter table public.ai_maintenance_runs enable row level security;
alter table public.ai_location_verification_history enable row level security;
alter table public.ai_field_verification_details enable row level security;

create policy ai_runs_staff_read on public.ai_maintenance_runs
  for select to authenticated
  using ((select public.has_permission('locations.edit'))
         or (select public.has_permission('locations.publish')));

create policy ai_verification_history_staff_read on public.ai_location_verification_history
  for select to authenticated
  using ((select public.has_permission('locations.edit'))
         or (select public.has_permission('locations.publish')));

create policy ai_field_verification_details_staff_read on public.ai_field_verification_details
  for select to authenticated
  using ((select public.has_permission('locations.edit'))
         or (select public.has_permission('locations.publish')));

-- Review status only; the trigger above blocks every other column.
create policy ai_field_verification_details_reviewer_update on public.ai_field_verification_details
  for update to authenticated
  using ((select public.has_permission('locations.publish')))
  with check ((select public.has_permission('locations.publish')));

revoke all on public.ai_maintenance_runs,
              public.ai_location_verification_history,
              public.ai_field_verification_details
  from public, anon, authenticated, service_role;

grant select on public.ai_maintenance_runs,
                public.ai_location_verification_history,
                public.ai_field_verification_details to authenticated;
grant update (review_status, reviewed_by, reviewed_at)
  on public.ai_field_verification_details to authenticated;

-- The worker (service role / direct connection) only inserts proposals.
grant select, insert, update on public.ai_maintenance_runs,
                                public.ai_location_verification_history,
                                public.ai_field_verification_details to service_role;

-- ---------------------------------------------------------------------------
-- Approval: the only path by which an AI proposal reaches public.locations.
--
-- SECURITY DEFINER because a publish-only employee cannot UPDATE content
-- columns on locations (locations_protect_content_fields). It authorises with
-- has_permission('locations.publish'), re-validates the proposal under a row
-- lock (verified, pending, known value, not stale) and changes exactly one
-- column. field_name is CHECK-constrained to the six fields, so %I is safe.
-- ---------------------------------------------------------------------------

create function public.ai_approve_field_proposal(p_detail_id uuid, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d   record;
  cur text;
begin
  if auth.uid() is null or not public.has_permission('locations.publish') then
    raise exception 'You do not have permission to approve AI verification fields.'
      using errcode = 'insufficient_privilege';
  end if;

  select fd.*, h.location_id
    into d
    from public.ai_field_verification_details fd
    join public.ai_location_verification_history h on h.id = fd.verification_history_id
   where fd.id = p_detail_id
     for update of fd;

  if not found then
    raise exception 'Field proposal not found.';
  end if;
  if d.location_id <> p_location_id then
    raise exception 'Location mismatch.';
  end if;
  if d.verification_status <> 'verified' then
    raise exception 'Cannot approve unverified field. Field must have grounded evidence.';
  end if;
  if d.review_status <> 'pending' then
    raise exception 'Field already %.', d.review_status;
  end if;
  if btrim(d.proposed_value) = ''
     or lower(btrim(d.proposed_value)) in ('unverified', 'unknown', 'null') then
    raise exception 'Proposed value is unverified/unknown and cannot be published.';
  end if;

  execute format('select %I from public.locations where id = $1 for update', d.field_name)
    into cur using p_location_id;
  if cur is distinct from d.current_value then
    raise exception 'Location value has been modified since this proposal (current: %, proposal was based on: %). Please refresh and review.',
      cur, d.current_value;
  end if;

  execute format('update public.locations set %I = $1 where id = $2', d.field_name)
    using d.proposed_value, p_location_id;

  update public.ai_field_verification_details
     set review_status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_detail_id;

  return jsonb_build_object(
    'field', d.field_name,
    'previous_value', d.current_value,
    'approved_value', d.proposed_value,
    'verification_history_id', d.verification_history_id,
    'confidence', d.confidence);
end;
$$;

revoke all on function public.ai_approve_field_proposal(uuid, uuid) from public, anon;
grant execute on function public.ai_approve_field_proposal(uuid, uuid) to authenticated;

-- The guard above would reject that UPDATE for a publish-only caller. Trust
-- the definer's own context (current_user = owner) IN ADDITION to the existing
-- trusted-context check (direct connections / service role), so service-role
-- behaviour is unchanged; PostgREST callers run as 'authenticated'/'anon' and
-- stay restricted. Body otherwise unchanged.
create or replace function public.protect_location_content_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'postgres' or public.is_trusted_db_context() then
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

-- ---------------------------------------------------------------------------
-- Activity log: allow the two actions the approval page records.
-- ---------------------------------------------------------------------------

alter table public.activity_events drop constraint activity_events_action_check;
alter table public.activity_events add constraint activity_events_action_check
  check (action in (
    'created', 'updated', 'published', 'unpublished',
    'images_updated', 'faqs_updated', 'pricing_updated',
    'ai_approved', 'ai_rejected'
  ));
