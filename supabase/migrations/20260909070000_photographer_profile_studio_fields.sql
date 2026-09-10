-- Additional photographer signup fields collected directly on the combined
-- account+profile signup form (/sign-in/photographer): studio name, plus
-- manual country/state/city — a photographer's own address, deliberately
-- free text and NOT a foreign key into countries/states/cities (those
-- tables back the Locations/Studios taxonomy, a different concept).
-- Purely additive and nullable: existing profiles created before this
-- phase simply have these unset until the photographer fills them in.

alter table public.photographer_profiles
  add column studio_name text,
  add column country text,
  add column state text,
  add column city text;
