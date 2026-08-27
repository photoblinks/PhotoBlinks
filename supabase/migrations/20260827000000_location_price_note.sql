-- Optional, admin-editable caption shown under the price value in the
-- location detail page's Pricing box (was previously hardcoded to
-- "Photoshoot Price" / "Free Photoshoot Location"). Location-only —
-- studios don't have this Pricing box.

alter table public.locations add column price_note text;
