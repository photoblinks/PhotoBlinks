-- Phase 10: location reporting. Any visitor (anonymous or signed-in) can
-- flag a published location as inaccurate/outdated/problematic. This is an
-- intake/moderation queue only — approving a report never touches location
-- data itself; admins act on it manually elsewhere. Purely additive.

create table public.location_reports (
  id                uuid        primary key default gen_random_uuid(),
  location_id       uuid        not null references public.locations (id) on delete restrict,
  reporter_user_id  uuid        references auth.users (id) on delete set null,
  report_type       text        not null check (report_type in (
                        'incorrect_information',
                        'location_closed',
                        'wrong_location',
                        'inappropriate_content',
                        'duplicate',
                        'other'
                      )),
  message           text        not null check (char_length(message) between 1 and 1000),
  status            text        not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note        text,
  reviewed_by       uuid        references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index location_reports_location_status_created_idx
  on public.location_reports (location_id, status, created_at);
create index location_reports_status_created_idx
  on public.location_reports (status, created_at);
create index location_reports_reporter_created_idx
  on public.location_reports (reporter_user_id, created_at)
  where reporter_user_id is not null;

create trigger location_reports_set_updated_at
  before update on public.location_reports
  for each row execute function public.set_updated_at();

alter table public.location_reports enable row level security;

-- No public/authenticated SELECT policy at all — reports are never readable
-- outside admin_all below. Deliberate: this table is a one-way intake box.

-- Anyone (anon or signed-in) may insert a report against a currently
-- published location. reporter_user_id must exactly match the session's
-- auth.uid() — NULL for anon, the caller's own id when signed in — so the
-- browser cannot forge another user's id or fake an anonymous report while
-- signed in. Every moderation field is pinned to its untouched default via
-- the WITH CHECK, so a forged status/reviewed_by/reviewed_at/admin_note in
-- the insert payload is rejected outright rather than silently accepted.
create policy location_reports_insert_any on public.location_reports
  for insert
  with check (
    reporter_user_id is not distinct from auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
    and exists (select 1 from public.locations l where l.id = location_id and l.is_published = true)
  );

-- Admins moderate through the same is_admin() mechanism as every other
-- admin-only table. Covers select (all statuses) / update (approve/reject,
-- admin_note) / delete.
create policy location_reports_admin_all on public.location_reports
  for all using (public.is_admin()) with check (public.is_admin());

-- Admin moderation listing: joins the location's name/slug and resolves a
-- privacy-safe reporter label (never exposes email/user id) — same pattern
-- as get_admin_location_comments(). SECURITY DEFINER only to reach
-- auth.users; self-guarded with an explicit is_admin() check since a
-- definer function bypasses RLS internally.
create function public.get_admin_location_reports(p_status text default null)
returns table (
  id             uuid,
  location_id    uuid,
  location_name  text,
  location_slug  text,
  reporter_label text,
  report_type    text,
  message        text,
  status         text,
  admin_note     text,
  reviewed_at    timestamptz,
  created_at     timestamptz
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
    lr.id,
    lr.location_id,
    l.name,
    l.slug,
    case
      when u.id is null then 'Anonymous'
      when pp.user_id is not null then 'Photographer'
      else 'Registered user'
    end,
    lr.report_type,
    lr.message,
    lr.status,
    lr.admin_note,
    lr.reviewed_at,
    lr.created_at
  from public.location_reports lr
  join public.locations l on l.id = lr.location_id
  left join auth.users u on u.id = lr.reporter_user_id
  left join public.photographer_profiles pp on pp.user_id = lr.reporter_user_id
  where p_status is null or lr.status = p_status
  order by lr.created_at desc;
end;
$$;

grant execute on function public.get_admin_location_reports(text) to authenticated;
