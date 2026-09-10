-- Phase 8: admin listing RPC for photographer photo submissions.
-- Joins photographer_profiles and locations so the admin queue shows all
-- required context without the browser making separate queries.
-- Security-definer + explicit is_admin() guard prevents non-admins from
-- using this function even if they obtain a valid auth token, mirrors
-- get_admin_location_comments() pattern exactly.

create function public.get_admin_photographer_submissions(p_status text default null)
returns table (
  id                       uuid,
  image_url                text,
  title                    text,
  description              text,
  phone_number             text,
  status                   text,
  rejection_reason         text,
  r2_deletion_status       text,
  reviewed_at              timestamptz,
  created_at               timestamptz,
  photographer_display_name text,
  photographer_phone       text,
  location_name            text,
  location_slug            text
)
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
  select
    pps.id,
    pps.image_url,
    pps.title,
    pps.description,
    pps.phone_number,
    pps.status,
    pps.rejection_reason,
    pps.r2_deletion_status,
    pps.reviewed_at,
    pps.created_at,
    pp.display_name  as photographer_display_name,
    pp.phone_number  as photographer_phone,
    l.name           as location_name,
    l.slug           as location_slug
  from public.photographer_photo_submissions pps
  join public.photographer_profiles pp on pp.user_id = pps.photographer_id
  join public.locations             l  on l.id       = pps.location_id
  where p_status is null or pps.status = p_status
  order by pps.created_at desc;
end;
$$;

grant execute on function public.get_admin_photographer_submissions(text) to authenticated;
