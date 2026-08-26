-- Optional extra detail fields for locations and studios, shown on the
-- public detail page only when the admin has filled them in. All nullable
-- — nothing here is required.

alter table public.locations
  add column drone_status text check (drone_status in ('allowed', 'restricted', 'conditional')),
  add column entry_fee text,
  add column best_season text,
  add column best_time text,
  add column crowd text,
  add column access text,
  add column privacy text;

alter table public.studios
  add column drone_status text check (drone_status in ('allowed', 'restricted', 'conditional')),
  add column entry_fee text,
  add column best_season text,
  add column best_time text,
  add column crowd text,
  add column access text,
  add column privacy text;
