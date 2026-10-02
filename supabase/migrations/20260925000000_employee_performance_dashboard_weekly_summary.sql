-- Phase 4c: daily-table + monthly/weekly summary layer for the Employee
-- Performance Dashboard.
--
-- Follows 20260922000000 / 20260923000000 exactly: security-definer,
-- parameterized read functions over the append-only activity_events table,
-- gated on `is_admin() or is_employee()` so every active employee (and every
-- legacy admin) keeps access. Asia/Kolkata day boundaries for every
-- date-derived value, explicit revoke + grant (no reliance on default ACLs).
--
-- Two changes, both additive:
--
--   1. get_employee_daily_activity() is REPLACED so the result is a
--      zero-filled, continuous calendar-day series across [p_from, p_to]
--      (generate_series), and so it reports `total_added` = locations_added +
--      studios_added (the dashboard's "Total Added"), replacing the old
--      count(*) `total_activities` which counted non-creation events too.
--      Zero-activity days now appear as 0 rows instead of being omitted, which
--      is what makes the monthly total reconcile with the daily table.
--
--   2. get_employee_period_summary() is ADDED - one row per employee giving
--      the requested range totals and the current-week totals for that same
--      range. "Current week" is computed server-side as the IST week (Monday
--      start) containing the LATEST day of the selected range, clamped to the
--      range end. No weeks are hard-coded and no per-day data is fetched into
--      the browser to derive them.
--
-- Removes and recreates get_employee_daily_activity (a return-type change
-- requires a drop) and adds get_employee_period_summary. No table, policy,
-- permission, or call signature changes: the argument list is identical, so
-- existing callers keep working. Both functions are idempotent to re-run.


-- ---------------------------------------------------------------------------
-- 1. Daily activity - zero-filled continuous series + total_added
-- ---------------------------------------------------------------------------
-- "added" is restricted to action = 'created' (matching the location/studio
-- semantics of get_employee_performance_stats), and counts distinct entities
-- per employee per IST day so a double-written event cannot inflate the
-- number. Days with no creation events still produce a row of zeros so the
-- daily table's date range is continuous.
--
-- The OUT row type changes (total_activities -> total_added), and Postgres
-- cannot CREATE OR REPLACE across a return-type change, so the old signature is
-- dropped first - the same pattern used by 20260907000000 / 20260912000000.
drop function if exists public.get_employee_daily_activity(uuid, date, date);

create or replace function public.get_employee_daily_activity(
  p_employee_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  activity_date    date,
  locations_added  bigint,
  studios_added    bigint,
  total_added      bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Kolkata')::date);
  v_to   date := coalesce(p_to,   (now() at time zone 'Asia/Kolkata')::date);
begin
  if not (public.is_admin() or public.is_employee()) then
    raise exception 'Not authorized';
  end if;

  if v_to < v_from then
    v_from := v_to;
  end if;

  return query
  with span as (
    select d::date as day
    from generate_series(v_from, v_to, interval '1 day') as d
  ),
  created as (
    select
      (ae.created_at at time zone 'Asia/Kolkata')::date as day,
      count(distinct ae.entity_id) filter (where ae.module = 'locations')::bigint as locations_added,
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as studios_added
    from public.activity_events ae
    where ae.action = 'created'
      and (p_employee_id is null or ae.user_id = p_employee_id)
      and (ae.created_at at time zone 'Asia/Kolkata')::date >= v_from
      and (ae.created_at at time zone 'Asia/Kolkata')::date <= v_to
    group by (ae.created_at at time zone 'Asia/Kolkata')::date
  )
  select
    s.day::date as activity_date,
    coalesce(c.locations_added, 0)::bigint as locations_added,
    coalesce(c.studios_added, 0)::bigint as studios_added,
    (coalesce(c.locations_added, 0) + coalesce(c.studios_added, 0))::bigint as total_added
  from span s
  left join created c on c.day = s.day
  order by s.day asc;
end;
$$;

revoke all on function public.get_employee_daily_activity(uuid, date, date) from public, anon;
grant execute on function public.get_employee_daily_activity(uuid, date, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Period summary - range totals + current-week totals per employee
-- ---------------------------------------------------------------------------
-- One row per active employee (or the single selected employee) so the
-- dashboard's monthly and weekly cards are all filled from a single RPC with
-- no client-side aggregation and no N+1 queries. Week = IST Monday..Sunday.
create or replace function public.get_employee_period_summary(
  p_employee_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  user_id                uuid,
  display_name           text,
  range_locations_added  bigint,
  range_studios_added    bigint,
  range_total_added      bigint,
  week_start             date,
  week_end               date,
  week_locations_added   bigint,
  week_studios_added     bigint,
  week_total_added       bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Kolkata')::date);
  v_to   date := coalesce(p_to,   (now() at time zone 'Asia/Kolkata')::date);
  v_week_start date;
  v_week_end   date;
  v_days_from_ref_monday int;
  v_monday date;
  v_sunday date;
begin
  if not (public.is_admin() or public.is_employee()) then
    raise exception 'Not authorized';
  end if;

  if v_to < v_from then
    v_from := v_to;
  end if;

  -- 2026-09-28 is a known Monday in Asia/Kolkata calendar.
  -- Days from that reference Monday to v_to, modulo 7, gives days back to the
  -- Monday of the week containing v_to. Works for any date (positive or negative).
  v_days_from_ref_monday := (v_to - date '2026-09-28')::int;
  v_monday := v_to - (((v_days_from_ref_monday % 7) + 7) % 7);
  v_sunday := v_monday + 6;

  -- Clamp to selected range
  v_week_start := greatest(v_from, v_monday);
  v_week_end   := least(v_to, v_sunday);

  return query
  with emp as (
    select e.user_id,
           coalesce(nullif(e.full_name, ''), split_part(u.email::text, '@', 1)) as display_name
    from public.employees e
    join auth.users u on u.id = e.user_id
    where e.is_active = true
      and (p_employee_id is null or e.user_id = p_employee_id)
  ),
  created as (
    select
      ae.user_id,
      (ae.created_at at time zone 'Asia/Kolkata')::date as day,
      ae.module,
      ae.entity_id
    from public.activity_events ae
    where ae.action = 'created'
      and ae.module in ('locations', 'studios')
      and (p_employee_id is null or ae.user_id = p_employee_id)
      and (ae.created_at at time zone 'Asia/Kolkata')::date >= v_from
      and (ae.created_at at time zone 'Asia/Kolkata')::date <= v_to
  ),
  range_counts as (
    select
      c.user_id,
      count(distinct c.entity_id) filter (where c.module = 'locations')::bigint as locations_added,
      count(distinct c.entity_id) filter (where c.module = 'studios')::bigint as studios_added
    from created c
    group by c.user_id
  ),
  week_counts as (
    select
      c.user_id,
      count(distinct c.entity_id) filter (where c.module = 'locations')::bigint as locations_added,
      count(distinct c.entity_id) filter (where c.module = 'studios')::bigint as studios_added
    from created c
    where c.day >= v_week_start and c.day <= v_week_end
    group by c.user_id
  )
  select
    emp.user_id,
    emp.display_name,
    coalesce(rc.locations_added, 0)::bigint,
    coalesce(rc.studios_added, 0)::bigint,
    (coalesce(rc.locations_added, 0) + coalesce(rc.studios_added, 0))::bigint,
    v_week_start,
    v_week_end,
    coalesce(wc.locations_added, 0)::bigint,
    coalesce(wc.studios_added, 0)::bigint,
    (coalesce(wc.locations_added, 0) + coalesce(wc.studios_added, 0))::bigint
  from emp
  left join range_counts rc on rc.user_id = emp.user_id
  left join week_counts wc on wc.user_id = emp.user_id
  order by (coalesce(rc.locations_added, 0) + coalesce(rc.studios_added, 0)) desc,
           emp.display_name asc;
end;
$$;

revoke all on function public.get_employee_period_summary(uuid, date, date) from public, anon;
grant execute on function public.get_employee_period_summary(uuid, date, date) to authenticated;