-- Phase 4b follow-up: open the Employee Performance dashboard to EVERY
-- active employee, not just activity.view holders.
--
-- 20260922000000 gated both performance RPCs behind
-- has_permission('activity.view'), which locked content_manager employees
-- (locations/studios edit+publish, but no activity.view) out of the
-- dashboard. This migration redefines ONLY those two security-definer read
-- functions to gate on `is_admin() or is_employee()` instead — i.e. any
-- legacy admin or any ACTIVE employee. is_employee() already requires
-- is_active = true, so inactive employees stay blocked; admins pass via
-- is_admin() (they may have no employees row).
--
-- Purely additive: only the two functions are replaced. No table, policy,
-- grant, trigger, or other function is altered. Idempotent
-- (create or replace + revoke/grant), matching the convention in
-- 20260921000000 / 20260922000000.

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
  if not (public.is_admin() or public.is_employee()) then
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
