-- Optional admin-editable SEO overrides. When set, these replace the
-- auto-generated <title> and meta description on the public detail page;
-- otherwise the existing auto-generated text is used as a fallback.

alter table public.locations
  add column meta_title text,
  add column meta_description text;

alter table public.studios
  add column meta_title text,
  add column meta_description text;
