-- Sidebar notification badges for the admin panel.
-- Pending moderation queues (comments, photographer photos, location reports)
-- are counted by status = 'pending'. Users and Photographer Profiles have no
-- pending state, so "new" means created since this admin last opened that page,
-- tracked per admin in admin_page_seen. Additive only.

create table public.admin_page_seen (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  page_key text        not null check (page_key in ('users', 'photographer_profiles')),
  seen_at  timestamptz not null default now(),
  primary key (user_id, page_key)
);

alter table public.admin_page_seen enable row level security;

create policy admin_page_seen_own on public.admin_page_seen
  for all
  using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());

-- Not stable: the first call per admin seeds seen_at = now() so existing
-- accounts do not show up as "new" the moment this ships.
create function public.get_admin_nav_badge_counts()
returns table (
  pending_comments      bigint,
  pending_photos        bigint,
  pending_reports       bigint,
  new_users             bigint,
  new_photographers     bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users_seen timestamptz;
  v_photographers_seen timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  insert into public.admin_page_seen (user_id, page_key)
  values (auth.uid(), 'users'), (auth.uid(), 'photographer_profiles')
  on conflict do nothing;

  select seen_at into v_users_seen
    from public.admin_page_seen where user_id = auth.uid() and page_key = 'users';
  select seen_at into v_photographers_seen
    from public.admin_page_seen where user_id = auth.uid() and page_key = 'photographer_profiles';

  return query
  select
    (select count(*) from public.location_comments where status = 'pending'),
    (select count(*) from public.photographer_photo_submissions where status = 'pending'),
    (select count(*) from public.location_reports where status = 'pending'),
    (select count(*)
       from auth.users u
      where u.created_at > v_users_seen
        and not exists (select 1 from public.admins a where a.user_id = u.id)
        and not exists (select 1 from public.employees e where e.user_id = u.id)
        and not exists (select 1 from public.photographer_profiles p where p.user_id = u.id)),
    (select count(*) from public.photographer_profiles p where p.created_at > v_photographers_seen);
end;
$$;
