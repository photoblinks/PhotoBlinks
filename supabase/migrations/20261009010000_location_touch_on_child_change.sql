-- locations.created_at / updated_at already exist, and locations_set_updated_at
-- bumps updated_at on any row update. Edits to a location's child rows (images,
-- FAQs) never touched the parent row, so "last updated" missed them. This bumps
-- locations.updated_at whenever a child row is inserted, updated, or deleted.
--
-- Additive: one security-definer function (bypasses the locations publish/edit
-- guards, which only ever see a plain updated_at change) + two triggers.

create or replace function public.touch_location_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.locations
  set updated_at = now()
  where id = coalesce(new.location_id, old.location_id);
  return null;
end;
$$;

revoke all on function public.touch_location_updated_at() from public, anon, authenticated;

create trigger location_images_touch_location
  after insert or update or delete on public.location_images
  for each row execute function public.touch_location_updated_at();

create trigger location_faqs_touch_location
  after insert or update or delete on public.location_faqs
  for each row execute function public.touch_location_updated_at();
