-- Optional per-category overrides for the dedicated /category/[slug] page:
-- the H1 shown over the banner (falls back to an auto-generated heading),
-- and SEO title/description overrides (fall back to auto-generated text).
-- The category's existing image_url doubles as that page's banner image.

alter table public.categories
  add column h1_title text,
  add column meta_title text,
  add column meta_description text;
