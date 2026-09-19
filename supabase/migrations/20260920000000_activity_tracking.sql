-- Phase 4: employee activity tracking + employee counts dashboard.
--
-- Append-only activity_events, written exclusively by server-side code via
-- the service-role client (which bypasses RLS) so the browser has no write
-- path and employees cannot fabricate or tamper with history. There are
-- deliberately NO anon/authenticated policies on this table; aggregates are
-- read back through the security-definer summary RPC guarded by the existing
-- dashboard.view permission (legacy admins pass automatically via is_admin()).
--
-- Purely additive: no existing table, function, policy, or permission changes.

create table public.activity_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  module     text        not null check (module in ('locations', 'studios')),
  action     text        not null check (action in (
               'created', 'updated', 'published', 'unpublished',
               'images_updated', 'faqs_updated', 'pricing_updated'
             )),
  entity_id  uuid        not null,
  created_at timestamptz not null default now(),
  metadata   jsonb
);

create index activity_events_user_created_idx
  on public.activity_events (user_id, created_at desc);
create index activity_events_entity_created_idx
  on public.activity_events (entity_id, created_at desc);
create index activity_events_module_created_idx
  on public.activity_events (module, created_at desc);

alter table public.activity_events enable row level security;

-- One employee + one entity + one day = one unique "work item" for counting.
-- get_admin_activity_summary() returns, per active employee, today's unique
-- entities, this month's unique (entity, day) pairs, distinct locations and
-- studios worked on this month, the per-action breakdown, and the last
-- activity timestamp.
create or replace function public.get_admin_activity_summary()
returns table (
  user_id         uuid,
  display_name    text,
  daily_unique    bigint,
  monthly_unique  bigint,
  locations_count bigint,
  studios_count   bigint,
  last_activity   timestamptz,
  monthly_actions jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.has_permission('dashboard.view') then
    raise exception 'Not authorized';
  end if;

  return query
  with active_employees as (
    select e.user_id, e.full_name, u.email
    from public.employees e
    join auth.users u on u.id = e.user_id
    where e.is_active = true
  ),
  monthly_entity as (
    select
      ae.user_id,
      count(distinct (ae.entity_id, ae.created_at::date))::bigint as monthly_unique,
      count(distinct ae.entity_id) filter (where ae.module = 'locations')::bigint as locations_count,
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as studios_count,
      count(distinct ae.entity_id) filter (where ae.created_at >= date_trunc('day', now()))::bigint as daily_unique
    from public.activity_events ae
    where ae.created_at >= date_trunc('month', now())
    group by ae.user_id
  ),
  monthly_action as (
    select a.user_id, jsonb_object_agg(a.action, a.cnt) as monthly_actions
    from (
      select ae.user_id, ae.action, count(*)::bigint as cnt
      from public.activity_events ae
      where ae.created_at >= date_trunc('month', now())
      group by ae.user_id, ae.action
    ) a
    group by a.user_id
  ),
  last_activity as (
    select ae.user_id, max(ae.created_at) as last_activity
    from public.activity_events ae
    group by ae.user_id
  )
  select
    emp.user_id,
    coalesce(nullif(emp.full_name, ''), split_part(emp.email, '@', 1)) as display_name,
    coalesce(me.daily_unique, 0),
    coalesce(me.monthly_unique, 0),
    coalesce(me.locations_count, 0),
    coalesce(me.studios_count, 0),
    la.last_activity,
    coalesce(ma.monthly_actions, '{}'::jsonb)
  from active_employees emp
  left join monthly_entity me on me.user_id = emp.user_id
  left join monthly_action ma on ma.user_id = emp.user_id
  left join last_activity la on la.user_id = emp.user_id
  order by coalesce(me.monthly_unique, 0) desc, emp.email asc;
end;
$$;

grant execute on function public.get_admin_activity_summary() to authenticated;
