-- More optional extra-detail fields for locations and studios (round 2).
-- `camera_charges` is renamed to `shoot_permit_fee` and moves from "Shoot
-- Details" to "Pricing & Timing" in the admin form/public display — a plain
-- rename preserves existing data. Everything else here is a new nullable
-- column; nothing is required.

alter table public.locations
  rename column camera_charges to shoot_permit_fee;
alter table public.studios
  rename column camera_charges to shoot_permit_fee;

alter table public.locations
  add column recommended_outfits text,
  add column vehicle_parking_fee text,
  add column road_accessibility text,
  add column boating_available text,
  add column restrooms text,
  add column weather_lighting text;

alter table public.studios
  add column recommended_outfits text,
  add column vehicle_parking_fee text,
  add column road_accessibility text,
  add column boating_available text,
  add column restrooms text,
  add column weather_lighting text;
