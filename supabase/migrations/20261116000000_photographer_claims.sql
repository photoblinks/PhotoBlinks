-- Claiming an unclaimed (bulk-imported) photographer profile.
--
-- Flow: the claimant picks a profile on /claim-profile, fills in details and
-- proves ownership of their email with a one-time code (Supabase email OTP;
-- the app verifies it, then calls submit_photographer_claim as that user).
-- The request waits for an admin. Only approve_photographer_claim (admin)
-- can set photographer_profiles.user_id; nothing here lets a claimant take a
-- profile on their own.
--
-- 1. photographer_claim_requests: one row per claim. RLS: admin full access;
--    a claimant can read only their own rows. No direct insert policy.
-- 2. search_claimable_photographers(q): min-length, limited, returns only
--    what the public page already shows (studio, city, state) — never the
--    phone/email — for active, unclaimed profiles.
-- 3. submit_photographer_claim(...): the only insert path. Needs an
--    authenticated caller, refuses profiles that are claimed/inactive, callers
--    who already have a profile, and caps pending claims per caller.
-- 4. approve_photographer_claim(id): admin only; locks the profile, re-checks
--    it is still unclaimed, assigns user_id, rejects other pending claims for
--    the same profile, and records the email as verified (it was proven by
--    the OTP) so the profile stays publicly visible.
--
-- Reversible via: drop the three functions, then drop table
-- public.photographer_claim_requests.

create table public.photographer_claim_requests (
  id          uuid        primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.photographer_profiles (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  full_name   text        not null check (char_length(full_name) between 1 and 200),
  studio_name text        not null check (char_length(studio_name) between 1 and 200),
  email       text        not null check (char_length(email) <= 320),
  phone_number text       not null check (char_length(phone_number) <= 20),
  proof_url   text        not null check (char_length(proof_url) <= 500 and proof_url like 'https://%'),
  message     text        not null check (char_length(message) between 1 and 1000),
  status      text        not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index photographer_claim_requests_pending_uq
  on public.photographer_claim_requests (profile_id, user_id) where status = 'pending';
create index photographer_claim_requests_status_idx
  on public.photographer_claim_requests (status, created_at desc);

alter table public.photographer_claim_requests enable row level security;

create policy photographer_claim_requests_own_read on public.photographer_claim_requests
  for select using (user_id = auth.uid());
create policy photographer_claim_requests_admin_all on public.photographer_claim_requests
  for all using (public.is_admin()) with check (public.is_admin());

create function public.search_claimable_photographers(p_query text)
returns table (id uuid, studio_name text, city text, state_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.studio_name, p.city, s.name
  from public.photographer_profiles p
  join public.states s on s.id = p.state_id
  where char_length(trim(coalesce(p_query, ''))) >= 3
    and p.user_id is null
    and p.is_active
    and p.suspended_at is null
    and (
      p.studio_name ilike '%' || trim(p_query) || '%'
      or p.display_name ilike '%' || trim(p_query) || '%'
    )
  order by p.studio_name
  limit 8;
$$;

revoke execute on function public.search_claimable_photographers(text) from public;
grant execute on function public.search_claimable_photographers(text) to anon, authenticated;

create function public.submit_photographer_claim(
  p_profile_id   uuid,
  p_full_name    text,
  p_studio_name  text,
  p_phone_number text,
  p_proof_url    text,
  p_message      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Account has no email';
  end if;

  if exists (select 1 from public.photographer_profiles where user_id = auth.uid()) then
    raise exception 'This email already has a photographer account.';
  end if;

  if not exists (
    select 1 from public.photographer_profiles
    where id = p_profile_id and user_id is null and is_active and suspended_at is null
  ) then
    raise exception 'This profile is not available to claim.';
  end if;

  if (select count(*) from public.photographer_claim_requests
      where user_id = auth.uid() and status = 'pending') >= 3 then
    raise exception 'You already have pending claim requests.';
  end if;

  insert into public.photographer_claim_requests
    (profile_id, user_id, full_name, studio_name, email, phone_number, proof_url, message)
  values
    (p_profile_id, auth.uid(), trim(p_full_name), trim(p_studio_name), v_email,
     trim(p_phone_number), trim(p_proof_url), trim(p_message))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_photographer_claim(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.submit_photographer_claim(uuid, text, text, text, text, text) to authenticated;

create function public.approve_photographer_claim(p_claim_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.photographer_claim_requests;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_claim from public.photographer_claim_requests
    where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then
    raise exception 'This request is no longer pending.';
  end if;

  perform 1 from public.photographer_profiles where id = v_claim.profile_id for update;
  if not exists (
    select 1 from public.photographer_profiles
    where id = v_claim.profile_id and user_id is null
  ) then
    raise exception 'This profile has already been claimed.';
  end if;

  if exists (select 1 from public.photographer_profiles where user_id = v_claim.user_id) then
    raise exception 'This account already has a photographer profile.';
  end if;

  update public.photographer_profiles set user_id = v_claim.user_id where id = v_claim.profile_id;

  update public.photographer_claim_requests
    set status = 'approved', reviewed_at = now() where id = v_claim.id;
  update public.photographer_claim_requests
    set status = 'rejected', reviewed_at = now()
    where profile_id = v_claim.profile_id and status = 'pending' and id <> v_claim.id;

  insert into public.email_verifications (user_id) values (v_claim.user_id)
    on conflict do nothing;

  return v_claim.email;
end;
$$;

revoke execute on function public.approve_photographer_claim(uuid) from public, anon;
grant execute on function public.approve_photographer_claim(uuid) to authenticated;
