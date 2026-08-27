-- Optional, admin-editable shorter name shown on location/studio cards in
-- listings (grid views) — the full `name` (often long/SEO-oriented, e.g.
-- "Bangalore Palace - Best Pre-wedding Photoshoot Location") stays
-- unchanged for the detail page H1, meta title, and breadcrumbs. When
-- left blank, the card falls back to the full name.

alter table public.locations add column card_name text;
alter table public.studios add column card_name text;
