-- Phase 13: Realtime updates for the photographer submission dashboard and
-- the admin moderation queues (photographer photos + location reports).
-- Adds both tables to the supabase_realtime publication so postgres_changes
-- events are replicated to subscribed clients. This changes no
-- authorization: Realtime evaluates each table's existing RLS SELECT
-- policies (pps_photographer_select / pps_admin_all / location_reports_admin_all)
-- per subscriber, so a client only ever receives change events for rows it
-- could already read directly.

alter publication supabase_realtime add table public.photographer_photo_submissions;
alter publication supabase_realtime add table public.location_reports;
