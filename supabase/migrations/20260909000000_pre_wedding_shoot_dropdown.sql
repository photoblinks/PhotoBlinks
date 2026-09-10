-- Change "Pre-Wedding Shoot" from free text to a fixed Allowed / Conditional
-- / Prohibited dropdown, plus a free-text condition note field for when it's
-- Conditional — same shape as Drone Status / Drone Permission. Existing
-- free-text values are cleared first since they can't be mapped into the
-- new set (mirrors the drone_status rename precedent).

update public.locations set pre_wedding_shoot = null
  where pre_wedding_shoot is not null
    and pre_wedding_shoot not in ('allowed', 'conditional', 'prohibited');
update public.studios set pre_wedding_shoot = null
  where pre_wedding_shoot is not null
    and pre_wedding_shoot not in ('allowed', 'conditional', 'prohibited');

alter table public.locations
  add constraint locations_pre_wedding_shoot_check
  check (pre_wedding_shoot in ('allowed', 'conditional', 'prohibited')),
  add column pre_wedding_shoot_condition text;

alter table public.studios
  add constraint studios_pre_wedding_shoot_check
  check (pre_wedding_shoot in ('allowed', 'conditional', 'prohibited')),
  add column pre_wedding_shoot_condition text;
