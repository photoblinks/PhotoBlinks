-- Rename the "Conditional" Drone Status option to "Prohibited" (existing
-- rows updated first so the new constraint never rejects live data).

update public.locations set drone_status = 'prohibited' where drone_status = 'conditional';
update public.studios set drone_status = 'prohibited' where drone_status = 'conditional';

alter table public.locations drop constraint locations_drone_status_check;
alter table public.locations
  add constraint locations_drone_status_check
  check (drone_status in ('allowed', 'allowed_with_permission', 'restricted', 'prohibited'));

alter table public.studios drop constraint studios_drone_status_check;
alter table public.studios
  add constraint studios_drone_status_check
  check (drone_status in ('allowed', 'allowed_with_permission', 'restricted', 'prohibited'));
