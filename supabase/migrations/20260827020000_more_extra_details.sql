-- More optional extra-detail fields for locations and studios, grouped on
-- the public detail page and in the admin form into: Shoot Details,
-- Pricing & Timing, Amenities, Environment. All nullable — nothing here is
-- required.

alter table public.locations
  add column pre_wedding_shoot text,
  add column prior_booking text,
  add column camera_charges text,
  add column changing_rooms text check (changing_rooms in ('available', 'not_available')),
  add column parking_facility text check (parking_facility in ('available', 'not_available')),
  add column facilities text;

alter table public.studios
  add column pre_wedding_shoot text,
  add column prior_booking text,
  add column camera_charges text,
  add column changing_rooms text check (changing_rooms in ('available', 'not_available')),
  add column parking_facility text check (parking_facility in ('available', 'not_available')),
  add column facilities text;
