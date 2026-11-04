-- App-level email verification ("session now, verify later").
--
-- Supabase "Confirm email" is switched OFF so a signup gets a session at once
-- (GoTrue then auto-confirms the account, so auth.users.email_confirmed_at no
-- longer means "owns this email"). Verification is tracked here instead: a
-- verification email is sent after signup and clicking it signs the user in
-- through a one-time email OTP, which is the only thing that may call
-- mark_email_verified().
--
-- 1. email_verifications: one row per verified user. Users can read their own
--    row; nobody can write it directly.
-- 2. mark_email_verified(): security definer; refuses unless the caller's JWT
--    was issued through an email OTP / magic link (auth.jwt() -> amr), i.e.
--    proof of owning the address — a password login alone is not enough.
-- 3. is_email_verified(uid): row exists OR the account came from a non-email
--    provider (Google already verified the address). Self or admin only.
-- 4. get_unverified_user_ids(ids): admin batch lookup for the photographer
--    requests screen.
-- 5. is_photographer() now means "has a profile that is not suspended", so a
--    photographer waiting for verification/approval can use the dashboard and
--    submit to the moderation queue. Public visibility is unchanged: the
--    profile/share-link paths still require is_active, and submissions are only
--    public after an admin approves them.
--
-- Backfill: every existing account that already confirmed its email is marked
-- verified so nobody is nagged on deploy.
-- Reversible via: drop the four functions' new versions / table, and restore
-- is_photographer() to "is_active = true" (20260909010000).

create table public.email_verifications (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now()
);

alter table public.email_verifications enable row level security;

create policy email_verifications_own_read on public.email_verifications
  for select using (user_id = auth.uid());

create policy email_verifications_admin_read on public.email_verifications
  for select using (public.is_admin());

insert into public.email_verifications (user_id, verified_at)
select id, email_confirmed_at from auth.users where email_confirmed_at is not null
on conflict do nothing;

create function public.mark_email_verified()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email')
  ) then
    raise exception 'Email ownership not proven';
  end if;

  insert into public.email_verifications (user_id) values (auth.uid())
  on conflict do nothing;
end;
$$;

revoke execute on function public.mark_email_verified() from public, anon;
grant execute on function public.mark_email_verified() to authenticated;

create function public.is_email_verified(p_user uuid default auth.uid())
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_user is null then
    return false;
  end if;
  if p_user is distinct from auth.uid() and not public.is_admin() then
    return false;
  end if;

  return exists (select 1 from public.email_verifications where user_id = p_user)
    or exists (
      select 1 from auth.users u
      where u.id = p_user
        and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
    );
end;
$$;

revoke execute on function public.is_email_verified(uuid) from public, anon;
grant execute on function public.is_email_verified(uuid) to authenticated;

create function public.get_unverified_user_ids(p_ids uuid[])
returns setof uuid
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
  select i
  from unnest(p_ids) as i
  where not exists (select 1 from public.email_verifications v where v.user_id = i)
    and not exists (
      select 1 from auth.users u
      where u.id = i
        and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
    );
end;
$$;

revoke execute on function public.get_unverified_user_ids(uuid[]) from public, anon;
grant execute on function public.get_unverified_user_ids(uuid[]) to authenticated;

create or replace function public.is_photographer()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.photographer_profiles
    where user_id = auth.uid()
      and suspended_at is null
  );
$$;
