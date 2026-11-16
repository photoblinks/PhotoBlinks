-- Employee Performance: track photographer profiles each employee added.
-- Same rule as locations/studios: a photographer counts when it GOES LIVE
-- (draft -> active), credited to whoever activated it (activity_added_events
-- resolves the first 'published' event), and only while currently active.
--
-- 1. activity_events accepts module 'photographers'.
-- 2. get_employee_daily_activity / get_employee_period_summary gain a
--    photographers_added column (and total_added includes it). Return types
--    change, so the functions are dropped and recreated with the same guards.
--
-- ROLLBACK (manual): restore both functions from
-- 20261010020000_performance_count_on_publish.sql, restore the module check
-- to ('locations', 'studios') after deleting photographers rows.

alter table public.activity_events drop constraint activity_events_module_check;
alter table public.activity_events add constraint activity_events_module_check
  check (module in ('locations', 'studios', 'photographers'));

-- ---------------------------------------------------------------------------
-- Daily activity
-- ---------------------------------------------------------------------------
drop function public.get_employee_daily_activity(uuid, date, date);

create function public.get_employee_daily_activity(
  p_employee_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  activity_date       date,
  locations_added     bigint,
  studios_added       bigint,
  photographers_added bigint,
  total_added         bigint
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

  -- Non-admin staff only ever see their own numbers, whatever id the caller sends.
  if not public.is_admin() then
    p_employee_id := auth.uid();
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
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as studios_added,
      count(distinct ae.entity_id) filter (where ae.module = 'photographers')::bigint as photographers_added
    from public.activity_added_events ae
    where (
        (ae.module in ('locations', 'studios') and public.activity_entity_is_published(ae.module, ae.entity_id))
        or (ae.module = 'photographers'
            and exists (select 1 from public.photographer_profiles p where p.id = ae.entity_id and p.is_active))
      )
      and (p_employee_id is null or ae.user_id = p_employee_id)
      and (ae.created_at at time zone 'Asia/Kolkata')::date >= v_from
      and (ae.created_at at time zone 'Asia/Kolkata')::date <= v_to
    group by (ae.created_at at time zone 'Asia/Kolkata')::date
  )
  select
    s.day::date as activity_date,
    coalesce(c.locations_added, 0)::bigint,
    coalesce(c.studios_added, 0)::bigint,
    coalesce(c.photographers_added, 0)::bigint,
    (coalesce(c.locations_added, 0) + coalesce(c.studios_added, 0) + coalesce(c.photographers_added, 0))::bigint
  from span s
  left join created c on c.day = s.day
  order by s.day asc;
end;
$$;

revoke all on function public.get_employee_daily_activity(uuid, date, date) from public, anon;
grant execute on function public.get_employee_daily_activity(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Period summary
-- ---------------------------------------------------------------------------
drop function public.get_employee_period_summary(uuid, date, date);

create function public.get_employee_period_summary(
  p_employee_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  user_id                    uuid,
  display_name               text,
  range_locations_added      bigint,
  range_studios_added        bigint,
  range_photographers_added  bigint,
  range_total_added          bigint,
  week_start                 date,
  week_end                   date,
  week_locations_added       bigint,
  week_studios_added         bigint,
  week_photographers_added   bigint,
  week_total_added           bigint
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

  -- Non-admin staff only ever see their own numbers, whatever id the caller sends.
  if not public.is_admin() then
    p_employee_id := auth.uid();
  end if;

  if v_to < v_from then
    v_from := v_to;
  end if;

  -- 2026-09-28 is a known Monday in Asia/Kolkata calendar.
  v_days_from_ref_monday := (v_to - date '2026-09-28')::int;
  v_monday := v_to - (((v_days_from_ref_monday % 7) + 7) % 7);
  v_sunday := v_monday + 6;

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
    from public.activity_added_events ae
    where ae.module in ('locations', 'studios', 'photographers')
      and (
        (ae.module in ('locations', 'studios') and public.activity_entity_is_published(ae.module, ae.entity_id))
        or (ae.module = 'photographers'
            and exists (select 1 from public.photographer_profiles p where p.id = ae.entity_id and p.is_active))
      )
      and (p_employee_id is null or ae.user_id = p_employee_id)
      and (ae.created_at at time zone 'Asia/Kolkata')::date >= v_from
      and (ae.created_at at time zone 'Asia/Kolkata')::date <= v_to
  ),
  range_counts as (
    select
      c.user_id,
      count(distinct c.entity_id) filter (where c.module = 'locations')::bigint as locations_added,
      count(distinct c.entity_id) filter (where c.module = 'studios')::bigint as studios_added,
      count(distinct c.entity_id) filter (where c.module = 'photographers')::bigint as photographers_added
    from created c
    group by c.user_id
  ),
  week_counts as (
    select
      c.user_id,
      count(distinct c.entity_id) filter (where c.module = 'locations')::bigint as locations_added,
      count(distinct c.entity_id) filter (where c.module = 'studios')::bigint as studios_added,
      count(distinct c.entity_id) filter (where c.module = 'photographers')::bigint as photographers_added
    from created c
    where c.day >= v_week_start and c.day <= v_week_end
    group by c.user_id
  )
  select
    emp.user_id,
    emp.display_name,
    coalesce(rc.locations_added, 0)::bigint,
    coalesce(rc.studios_added, 0)::bigint,
    coalesce(rc.photographers_added, 0)::bigint,
    (coalesce(rc.locations_added, 0) + coalesce(rc.studios_added, 0) + coalesce(rc.photographers_added, 0))::bigint,
    v_week_start,
    v_week_end,
    coalesce(wc.locations_added, 0)::bigint,
    coalesce(wc.studios_added, 0)::bigint,
    coalesce(wc.photographers_added, 0)::bigint,
    (coalesce(wc.locations_added, 0) + coalesce(wc.studios_added, 0) + coalesce(wc.photographers_added, 0))::bigint
  from emp
  left join range_counts rc on rc.user_id = emp.user_id
  left join week_counts wc on wc.user_id = emp.user_id
  order by (coalesce(rc.locations_added, 0) + coalesce(rc.studios_added, 0) + coalesce(rc.photographers_added, 0)) desc,
           emp.display_name asc;
end;
$$;

revoke all on function public.get_employee_period_summary(uuid, date, date) from public, anon;
grant execute on function public.get_employee_period_summary(uuid, date, date) to authenticated;
