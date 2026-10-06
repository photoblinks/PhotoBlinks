-- Add 'limited' to the Vehicle Parking Availability and Changing Facilities
-- dropdowns (alongside available / not_available). Additive: existing rows
-- stay valid.

alter table public.locations drop constraint locations_changing_rooms_check;
alter table public.locations
  add constraint locations_changing_rooms_check
  check (changing_rooms in ('available', 'limited', 'not_available'));
alter table public.locations drop constraint locations_parking_facility_check;
alter table public.locations
  add constraint locations_parking_facility_check
  check (parking_facility in ('available', 'limited', 'not_available'));

alter table public.studios drop constraint studios_changing_rooms_check;
alter table public.studios
  add constraint studios_changing_rooms_check
  check (changing_rooms in ('available', 'limited', 'not_available'));
alter table public.studios drop constraint studios_parking_facility_check;
alter table public.studios
  add constraint studios_parking_facility_check
  check (parking_facility in ('available', 'limited', 'not_available'));
