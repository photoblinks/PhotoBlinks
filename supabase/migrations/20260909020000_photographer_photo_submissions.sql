-- Phase 6: photographer_photo_submissions — pending-first moderated photo pipeline.
-- Connects photographer identity (photographer_profiles) to uploaded R2 objects
-- and specific published locations. Status starts 'pending'; only admins can
-- move it to 'approved' or 'rejected'. Purely additive — does not touch any
-- existing table.

create table public.photographer_photo_submissions (
  id                  uuid        primary key default gen_random_uuid(),
  -- FK to photographer_profiles.user_id (not .id): photographer_id IS the
  -- auth user UUID. RESTRICT prevents silently destroying submission ownership
  -- records if a profile is later removed — requires explicit cleanup order.
  photographer_id     uuid        not null references public.photographer_profiles (user_id) on delete restrict,
  location_id         uuid        not null references public.locations (id) on delete restrict,
  -- R2 object identity. storage_key is the canonical owner of the object;
  -- image_url is derived from it. UNIQUE prevents the same R2 object being
  -- attached to multiple submissions (accidental duplicate). Both are set
  -- server-side and validated against the authenticated photographer namespace.
  storage_key         text        not null unique,
  storage_bucket      text        not null default 'photoblinks',
  image_url           text        not null,
  title               text        not null,
  description         text,
  phone_number        text        not null,
  status              text        not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
  rejection_reason    text,
  reviewed_by         uuid        references auth.users (id) on delete set null,
  reviewed_at         timestamptz,
  -- Tracks R2 cleanup lifecycle for rejected/orphaned objects (later phase).
  -- NULL = deletion not yet required. Non-null values set by a cleanup job.
  r2_deletion_status  text        check (r2_deletion_status in ('pending', 'failed', 'deleted')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Global admin moderation queue (most-recent first by status bucket)
create index pps_status_created_idx
  on public.photographer_photo_submissions (status, created_at desc);

-- Per-location moderation + gallery queries
create index pps_location_status_created_idx
  on public.photographer_photo_submissions (location_id, status, created_at desc);

-- Per-photographer dashboard listing + rate-limit counting
create index pps_photographer_created_idx
  on public.photographer_photo_submissions (photographer_id, created_at desc);

create trigger photographer_photo_submissions_set_updated_at
  before update on public.photographer_photo_submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.photographer_photo_submissions enable row level security;

-- Photographer: read own submissions only.
-- Anonymous and normal authenticated users see nothing.
create policy pps_photographer_select on public.photographer_photo_submissions
  for select
  using (photographer_id = auth.uid());

-- Photographer: insert own submission, as active photographer, pending only,
-- against a real published location. Mirrors location_comments_insert_own.
-- is_photographer() is security-definer and checks is_active = true, so
-- suspended photographers are blocked at the DB level even via direct API calls.
create policy pps_photographer_insert on public.photographer_photo_submissions
  for insert
  with check (
    public.is_photographer()
    and photographer_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.locations l
      where l.id = location_id
        and l.is_published = true
    )
  );

-- No UPDATE policy for photographers in this phase.
-- Title/description/phone edits are deferred to a later phase with a strict
-- server-action whitelist rather than broad UPDATE permissions.

-- No DELETE policy for photographers.
-- Submission cleanup belongs to the R2 deletion pipeline (later phase).

-- Admin: full access — approve, reject, delete, update rejection_reason, etc.
create policy pps_admin_all on public.photographer_photo_submissions
  for all
  using (public.is_admin())
  with check (public.is_admin());
