-- Phase B1: paginate the 3 admin moderation RPCs (comments, photographer
-- photo submissions, location reports) at the database level instead of
-- fetching every matching row and slicing in TypeScript.
--
-- p_limit/p_offset are appended with defaults (limit 20, offset 0) so any
-- other caller invoking these with only p_status keeps working unchanged.
-- Same is_admin() guard, same filter semantics, same join shape, same
-- security definer + explicit auth check pattern as the existing
-- get_admin_location_comments / get_admin_photographer_submissions /
-- get_admin_location_reports functions this migration extends.
--
-- Each list RPC gets a companion *_count RPC that applies the identical
-- p_status filter and admin guard, returning only a row count — no data
-- exposure beyond what the count itself implies.
--
-- Adding p_limit/p_offset changes each function's argument-type identity
-- (text) -> (text, int, int), so CREATE OR REPLACE cannot reuse the old
-- entry — it would silently create a second overload instead, and
-- PostgREST would then see two callable matches for an {p_status} RPC
-- call and reject it as ambiguous. Drop the single-arg signature first so
-- exactly one version of each function exists after this migration.

drop function if exists public.get_admin_location_comments(text);
drop function if exists public.get_admin_photographer_submissions(text);
drop function if exists public.get_admin_location_reports(text);

create or replace function public.get_admin_location_comments(
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  location_id uuid,
  location_name text,
  location_slug text,
  author_name text,
  comment text,
  rating smallint,
  status text,
  created_at timestamptz
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
    lc.id,
    lc.location_id,
    l.name,
    l.slug,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      split_part(u.email, '@', 1)
    ),
    lc.comment,
    lc.rating,
    lc.status,
    lc.created_at
  from public.location_comments lc
  join public.locations l on l.id = lc.location_id
  join auth.users u on u.id = lc.user_id
  where p_status is null or lc.status = p_status
  order by lc.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_location_comments(text, int, int) to authenticated;

create or replace function public.get_admin_location_comments_count(p_status text default null)
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
  from public.location_comments lc
  where p_status is null or lc.status = p_status;

  return result;
end;
$$;

grant execute on function public.get_admin_location_comments_count(text) to authenticated;

create or replace function public.get_admin_photographer_submissions(
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id                       uuid,
  image_url                text,
  title                    text,
  description              text,
  phone_number             text,
  status                   text,
  rejection_reason         text,
  r2_deletion_status       text,
  reviewed_at              timestamptz,
  created_at               timestamptz,
  photographer_display_name text,
  photographer_phone       text,
  location_name            text,
  location_slug            text
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
    pps.id,
    pps.image_url,
    pps.title,
    pps.description,
    pps.phone_number,
    pps.status,
    pps.rejection_reason,
    pps.r2_deletion_status,
    pps.reviewed_at,
    pps.created_at,
    pp.display_name  as photographer_display_name,
    pp.phone_number  as photographer_phone,
    l.name           as location_name,
    l.slug           as location_slug
  from public.photographer_photo_submissions pps
  join public.photographer_profiles pp on pp.user_id = pps.photographer_id
  join public.locations             l  on l.id       = pps.location_id
  where p_status is null or pps.status = p_status
  order by pps.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_photographer_submissions(text, int, int) to authenticated;

create or replace function public.get_admin_photographer_submissions_count(p_status text default null)
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
  from public.photographer_photo_submissions pps
  where p_status is null or pps.status = p_status;

  return result;
end;
$$;

grant execute on function public.get_admin_photographer_submissions_count(text) to authenticated;

create or replace function public.get_admin_location_reports(
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
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
  order by lr.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_location_reports(text, int, int) to authenticated;

create or replace function public.get_admin_location_reports_count(p_status text default null)
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
  from public.location_reports lr
  where p_status is null or lr.status = p_status;

  return result;
end;
$$;

grant execute on function public.get_admin_location_reports_count(text) to authenticated;
