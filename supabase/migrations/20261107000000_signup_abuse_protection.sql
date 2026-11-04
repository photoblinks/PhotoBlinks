-- Signup abuse protection.
--
-- 1. photographer_profiles.phone_number is unique per account. Compared on the
--    last 10 digits so "+91 98450 12345", "098450-12345" and "9845012345" are
--    the same number. Fails loudly (and changes nothing) if duplicates already
--    exist, so they can be resolved by hand first.
-- 2. photographer_phone_taken(): lets the signup/profile forms show a friendly
--    "already registered" message before an auth user is created.
-- 3. auth_rate_limits + check_rate_limit(): small DB-backed sliding-window
--    limiter for server actions (signup, verification-email resend). RLS is on
--    with no policies, so the table is reachable only through the function.
--
-- Reversible via: drop index photographer_profiles_phone_uq;
-- drop function public.photographer_phone_taken(text, uuid);
-- drop function public.check_rate_limit(text, int, int);
-- drop table public.auth_rate_limits;

do $$
begin
  if exists (
    select 1 from public.photographer_profiles
    group by right(regexp_replace(phone_number, '\D', '', 'g'), 10)
    having count(*) > 1
  ) then
    raise exception 'Duplicate photographer phone numbers exist; resolve them before applying this migration.';
  end if;
end $$;

create unique index photographer_profiles_phone_uq
  on public.photographer_profiles ((right(regexp_replace(phone_number, '\D', '', 'g'), 10)));

create function public.photographer_phone_taken(p_phone text, p_exclude_user uuid default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.photographer_profiles
    where right(regexp_replace(phone_number, '\D', '', 'g'), 10)
        = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
      and (p_exclude_user is null or user_id <> p_exclude_user)
  );
$$;

revoke execute on function public.photographer_phone_taken(text, uuid) from public;
grant execute on function public.photographer_phone_taken(text, uuid) to anon, authenticated;

create table public.auth_rate_limits (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);

create index auth_rate_limits_key_created_idx on public.auth_rate_limits (key, created_at);

alter table public.auth_rate_limits enable row level security;

-- Returns true and records the hit when the key is under its limit; false when
-- over. Keys are restricted to known prefixes and a short length so the table
-- cannot be used as free-form storage; each call also prunes a few old rows.
create function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_key is null
     or length(p_key) > 120
     or p_key !~ '^(signup|resend):'
     or p_limit < 1
     or p_window_seconds < 1 then
    return false;
  end if;

  delete from public.auth_rate_limits
  where id in (
    select id from public.auth_rate_limits
    where created_at < now() - interval '1 day'
    limit 200
  );

  select count(*) into v_count
  from public.auth_rate_limits
  where key = p_key
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.auth_rate_limits (key) values (p_key);
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to anon, authenticated;
