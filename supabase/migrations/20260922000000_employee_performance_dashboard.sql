-- Phase 4b: backend read layer for the Employee Performance Dashboard.
--
-- Two security-definer, parameterized RPCs over the append-only
-- activity_events table, gated by the existing activity.view permission
-- (legacy admins pass automatically via has_permission() -> is_admin()).
-- This follows 20260921000000: no reliance on default ACLs (explicit
-- revoke + grant), full column qualification, and Asia/Kolkata day/month
-- boundaries for every date-derived value.
--
-- Purely additive — only new functions are created. No table, policy, or
-- existing function is altered.

-- ---------------------------------------------------------------------------
-- 1. Per-employee statistics
-- ---------------------------------------------------------------------------
-- "added" = created (action = 'created'). "top_locations/top_studios" rank the
-- employee's most-active entities by total event count (not just creation),
-- with the entity name taken from event metadata where available.
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
  if not public.has_permission('activity.view') then
    raise exception 'Not authorized';
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
    from public.activity_events ae
    where ae.action = 'created'
      and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id
  ),
  days as (
    select ae.user_id,
      count(distinct (ae.created_at at time zone 'Asia/Kolkata')::date)::bigint as total_activity_days
    from public.activity_events ae
    where (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id
  ),
  entity_counts as (
    select ae.user_id, ae.module, ae.entity_id,
      max(ae.metadata ->> 'name') as entity_name,
      count(*)::bigint as cnt
    from public.activity_events ae
    where (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
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
-- 2. Date-wise daily activity
-- ---------------------------------------------------------------------------
-- One row per Asia/Kolkata calendar day. "added" = created. Optional employee
-- filter; null returns the team-wide timeline. Dates are IST calendar dates.
create or replace function public.get_employee_daily_activity(
  p_employee_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  activity_date    date,
  locations_added  bigint,
  studios_added    bigint,
  total_activities bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.has_permission('activity.view') then
    raise exception 'Not authorized';
  end if;

  return query
  select
    (ae.created_at at time zone 'Asia/Kolkata')::date as activity_date,
    count(distinct ae.entity_id) filter (where ae.module = 'locations' and ae.action = 'created')::bigint as locations_added,
    count(distinct ae.entity_id) filter (where ae.module = 'studios' and ae.action = 'created')::bigint as studios_added,
    count(*)::bigint as total_activities
  from public.activity_events ae
  where (p_employee_id is null or ae.user_id = p_employee_id)
    and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
    and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
  group by (ae.created_at at time zone 'Asia/Kolkata')::date
  order by (ae.created_at at time zone 'Asia/Kolkata')::date desc;
end;
$$;

revoke all on function public.get_employee_daily_activity(uuid, date, date) from public, anon;
grant execute on function public.get_employee_daily_activity(uuid, date, date) to authenticated;
