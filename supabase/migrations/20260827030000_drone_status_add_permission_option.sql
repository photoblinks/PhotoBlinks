-- Add "Allowed with Permission" as a fourth Drone Status option, alongside
-- the existing Allowed / Restricted / Conditional.

alter table public.locations drop constraint locations_drone_status_check;
alter table public.locations
  add constraint locations_drone_status_check
  check (drone_status in ('allowed', 'allowed_with_permission', 'restricted', 'conditional'));

alter table public.studios drop constraint studios_drone_status_check;
alter table public.studios
  add constraint studios_drone_status_check
  check (drone_status in ('allowed', 'allowed_with_permission', 'restricted', 'conditional'));
