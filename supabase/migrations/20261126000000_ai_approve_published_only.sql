-- AI proposals can only be approved for LIVE locations (is_published = true).
-- Redefines ai_approve_field_proposal (see 20261125000000) with one extra guard;
-- everything else in the function is unchanged.

create or replace function public.ai_approve_field_proposal(p_detail_id uuid, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d   record;
  cur text;
begin
  if auth.uid() is null or not public.has_permission('locations.publish') then
    raise exception 'You do not have permission to approve AI verification fields.'
      using errcode = 'insufficient_privilege';
  end if;

  select fd.*, h.location_id
    into d
    from public.ai_field_verification_details fd
    join public.ai_location_verification_history h on h.id = fd.verification_history_id
   where fd.id = p_detail_id
     for update of fd;

  if not found then
    raise exception 'Field proposal not found.';
  end if;
  if d.location_id <> p_location_id then
    raise exception 'Location mismatch.';
  end if;
  if not exists (select 1 from public.locations where id = p_location_id and is_published) then
    raise exception 'This location is not published, so its AI proposals cannot be reviewed.';
  end if;
  if d.verification_status <> 'verified' then
    raise exception 'Cannot approve unverified field. Field must have grounded evidence.';
  end if;
  if d.review_status <> 'pending' then
    raise exception 'Field already %.', d.review_status;
  end if;
  if btrim(d.proposed_value) = ''
     or lower(btrim(d.proposed_value)) in ('unverified', 'unknown', 'null') then
    raise exception 'Proposed value is unverified/unknown and cannot be published.';
  end if;

  execute format('select %I from public.locations where id = $1 for update', d.field_name)
    into cur using p_location_id;
  if cur is distinct from d.current_value then
    raise exception 'Location value has been modified since this proposal (current: %, proposal was based on: %). Please refresh and review.',
      cur, d.current_value;
  end if;

  execute format('update public.locations set %I = $1 where id = $2', d.field_name)
    using d.proposed_value, p_location_id;

  update public.ai_field_verification_details
     set review_status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_detail_id;

  return jsonb_build_object(
    'field', d.field_name,
    'previous_value', d.current_value,
    'approved_value', d.proposed_value,
    'verification_history_id', d.verification_history_id,
    'confidence', d.confidence);
end;
$$;
