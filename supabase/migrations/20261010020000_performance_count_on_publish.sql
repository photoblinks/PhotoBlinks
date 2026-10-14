-- Employee Performance Dashboard: count a location/studio when it GOES LIVE.
--
-- "Added" used to be the 'created' activity event, so a draft created earlier
-- and published today never counted today (and was credited to whoever created
-- the draft, not whoever published it). activity_added_events resolves one
-- "went live" event per entity: its first 'published' event, or, for an entity
-- created already published (no 'published' event), its 'created' event. The
-- three RPCs below are otherwise unchanged (create or replace, same signatures);
-- they still only count entities that are currently published.

create view public.activity_added_events as
select distinct on (module, entity_id)
  id,
  user_id,
  module,
  'created'::text as action,
  entity_id,
  created_at,
  metadata
from public.activity_events
where action in ('created', 'published')
order by module, entity_id, (action <> 'published'), created_at asc;

revoke all on public.activity_added_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Stats
-- ---------------------------------------------------------------------------
create or replace function public.get_employee_performance_stats(
  p_employee_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  user_id              uuid,
  display_name         text,
  total_locations_added bigint,
  total_studios_added  bigint,
  total_activity_days  bigint,
  top_locations        jsonb,
  top_studios          jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_employee()) then
    raise exception 'Not authorized';
  end if;

  -- Non-admin staff only ever see their own numbers, whatever id the caller sends.
  if not public.is_admin() then
    p_employee_id := auth.uid();
  end if;

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
    select ae.user_id,
      count(distinct ae.entity_id) filter (where ae.module = 'locations')::bigint as total_locations_added,
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as total_studios_added
    from public.activity_added_events ae
    where public.activity_entity_is_published(ae.module, ae.entity_id)
      and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id
  ),
  days as (
    select ae.user_id,
      count(distinct (ae.created_at at time zone 'Asia/Kolkata')::date)::bigint as total_activity_days
    from public.activity_events ae
    where public.activity_entity_is_published(ae.module, ae.entity_id)
      and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id
  ),
  entity_counts as (
    select ae.user_id, ae.module, ae.entity_id,
      max(ae.metadata ->> 'name') as entity_name,
      count(*)::bigint as cnt
    from public.activity_events ae
    where public.activity_entity_is_published(ae.module, ae.entity_id)
      and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id, ae.module, ae.entity_id
  ),
  top_locations as (
    select t.user_id,
      jsonb_agg(
        jsonb_build_object(
          'entity_id', t.entity_id,
          'name', coalesce(t.entity_name, t.entity_id::text),
          'count', t.cnt
        )
        order by t.cnt desc, coalesce(t.entity_name, '') asc
      ) as top_locations
    from (
      select ec.user_id, ec.entity_id, ec.entity_name, ec.cnt,
        row_number() over (
          partition by ec.user_id
          order by ec.cnt desc, coalesce(ec.entity_name, '') asc
        ) as rn
      from entity_counts ec
      where ec.module = 'locations'
    ) t
    where t.rn <= 5
    group by t.user_id
  ),
  top_studios as (
    select t.user_id,
      jsonb_agg(
        jsonb_build_object(
          'entity_id', t.entity_id,
          'name', coalesce(t.entity_name, t.entity_id::text),
          'count', t.cnt
        )
        order by t.cnt desc, coalesce(t.entity_name, '') asc
      ) as top_studios
    from (
      select ec.user_id, ec.entity_id, ec.entity_name, ec.cnt,
        row_number() over (
          partition by ec.user_id
          order by ec.cnt desc, coalesce(ec.entity_name, '') asc
        ) as rn
      from entity_counts ec
      where ec.module = 'studios'
    ) t
    where t.rn <= 5
    group by t.user_id
  )
  select
    emp.user_id,
    emp.display_name,
    coalesce(c.total_locations_added, 0),
    coalesce(c.total_studios_added, 0),
    coalesce(d.total_activity_days, 0),
    coalesce(tl.top_locations, '[]'::jsonb),
    coalesce(ts.top_studios, '[]'::jsonb)
  from emp
  left join created c on c.user_id = emp.user_id
  left join days d on d.user_id = emp.user_id
  left join top_locations tl on tl.user_id = emp.user_id
  left join top_studios ts on ts.user_id = emp.user_id
  order by coalesce(d.total_activity_days, 0) desc, emp.display_name asc;
end;
$$;

revoke all on function public.get_employee_performance_stats(uuid, date, date) from public, anon;
grant execute on function public.get_employee_performance_stats(uuid, date, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Daily activity
-- ---------------------------------------------------------------------------
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
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as studios_added
    from public.activity_added_events ae
    where public.activity_entity_is_published(ae.module, ae.entity_id)
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
-- 3. Period summary
-- ---------------------------------------------------------------------------
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
    where ae.module in ('locations', 'studios')
      and public.activity_entity_is_published(ae.module, ae.entity_id)
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
