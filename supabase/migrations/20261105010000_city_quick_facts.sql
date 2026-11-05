-- Admin-entered "Quick Facts" card for City pages (starting price, best
-- season, best shooting times, costumes). Free-text values keyed by field
-- name; validated and whitelisted in the application layer
-- (src/lib/city-quick-facts.ts). Public read is covered by the existing
-- cities_public_read policy.
--
-- Additive and nullable. Reversible via:
--   alter table public.cities drop column quick_facts;

alter table public.cities
  add column quick_facts jsonb;
