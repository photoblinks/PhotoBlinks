-- check_rate_limit only accepted keys starting "signup:" or "resend:", so the
-- claim-profile and forgot-password limiters ("claim:", "reset:") were always
-- rejected (returned false). Allow those two prefixes too.
-- Reversible via: restore the function from 20261107000000_signup_abuse_protection.sql.

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
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
     or p_key !~ '^(signup|resend|claim|reset):'
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
