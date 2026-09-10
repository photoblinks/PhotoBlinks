-- Phase 7: public RPC for approved photographer photos.
-- Public pages must NOT query photographer_photo_submissions directly — the
-- table has no public read policy by design (Phase 6). This security-definer
-- function is the only sanctioned path for anonymous/public reads. It
-- enforces status = 'approved' and location is_published = true internally,
-- and returns only the fields required for public display.
--
-- Mirrors the existing get_approved_location_comments() pattern.

create function public.get_approved_photographer_photos(p_location_id uuid)
returns table (
  id          uuid,
  image_url   text,
  title       text,
  description text,
  phone_number text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    pps.id,
    pps.image_url,
    pps.title,
    pps.description,
    pps.phone_number
  from public.photographer_photo_submissions pps
  join public.locations l on l.id = pps.location_id
  where pps.location_id = p_location_id
    and pps.status = 'approved'
    and l.is_published = true
  order by pps.created_at desc;
$$;

-- Grant execute to anon (public pages) and authenticated (logged-in visitors).
-- service_role inherits everything; no additional grant needed.
grant execute on function public.get_approved_photographer_photos(uuid) to anon, authenticated;
