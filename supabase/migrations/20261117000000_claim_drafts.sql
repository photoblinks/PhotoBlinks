-- Claimable profiles = any unclaimed, non-suspended profile, including
-- bulk-imported drafts (is_active = false). Previously only active ones could
-- be found, so a freshly imported draft could not be claimed. Approving a
-- claim on a draft makes it an owned profile that still waits for admin
-- activation (it then shows under On hold / Requests like any new signup).
-- Reversible via: restore both functions from 20261116000000_photographer_claims.sql.

create or replace function public.search_claimable_photographers(p_query text)
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
    and p.suspended_at is null
    and (
      p.studio_name ilike '%' || trim(p_query) || '%'
      or p.display_name ilike '%' || trim(p_query) || '%'
    )
  order by p.studio_name
  limit 8;
$$;


create or replace function public.submit_photographer_claim(
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
    where id = p_profile_id and user_id is null and suspended_at is null
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

