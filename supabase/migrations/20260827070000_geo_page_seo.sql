-- Optional per-record overrides for the country/state/city SEO landing
-- pages (each already exists once a location is added there): a banner
-- image, the H1 shown over it (falls back to auto-generated text), and
-- title/description overrides (fall back to auto-generated text) — the
-- same pattern as categories.

alter table public.countries
  add column image_url text,
  add column h1_title text,
  add column meta_title text,
  add column meta_description text;

alter table public.states
  add column image_url text,
  add column h1_title text,
  add column meta_title text,
  add column meta_description text;

alter table public.cities
  add column image_url text,
  add column h1_title text,
  add column meta_title text,
  add column meta_description text;
