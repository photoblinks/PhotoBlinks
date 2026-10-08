-- Phase 5: Views for primary images to avoid over-fetching all images
-- This migration creates views that return only the primary (first by sort_order)
-- image for each location/studio, eliminating the 5-10x over-fetch of gallery images
-- in listing queries.
--
-- security_invoker = true: the view runs with the CALLER's privileges and RLS,
-- not the owner's. A plain view is owned by postgres and would bypass the RLS
-- on location_images/studio_images, re-opening the anonymous bulk exposure
-- closed by 20261007000000_close_anon_bulk_exposure.sql. Public reads use the
-- service-role client (src/lib/supabase/public.ts), so anon/authenticated get
-- no access to these views; the app keeps filtering parents by is_published.

-- Primary image view for locations
create view public.location_primary_images
with (security_invoker = true)
as
select distinct on (location_id)
  location_id,
  image_url,
  sort_order
from public.location_images
order by location_id, sort_order, created_at, id;

-- Primary image view for studios
create view public.studio_primary_images
with (security_invoker = true)
as
select distinct on (studio_id)
  studio_id,
  image_url,
  sort_order
from public.studio_images
order by studio_id, sort_order, created_at, id;

revoke all on public.location_primary_images from anon, authenticated;
revoke all on public.studio_primary_images from anon, authenticated;
