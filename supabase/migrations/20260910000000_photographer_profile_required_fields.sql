-- Makes every user-entered photographer profile field that the profile
-- actually needs to be usable/contactable mandatory, both to match the
-- signup/edit forms (client + server validated) and at the database level.
--
-- Country/State become real foreign keys into the same canonical
-- countries/states tables Locations and Studios already use (see
-- 20260826020000_countries.sql), replacing the free-typed country/state
-- text columns added in 20260909070000 — those predate this requirement
-- and allowed arbitrary text with no relationship to real data. City stays
-- free text (a photographer's own city isn't required to exist in the
-- cities taxonomy the way a Location's does).
--
-- Existing rows: this project has zero photographer_profiles rows in both
-- local and production at the time of writing (same situation
-- 20260826020000_countries.sql was written in), so there is nothing to
-- migrate. For safety regardless, any row that does exist and can't meet
-- the new requirements is deactivated rather than having data invented for
-- it — an incomplete profile should not be presented as active, but its
-- historical data is left untouched.

alter table public.photographer_profiles
  add column country_id uuid references public.countries (id) on delete restrict,
  add column state_id uuid references public.states (id) on delete restrict;

update public.photographer_profiles
  set is_active = false,
      suspended_at = coalesce(suspended_at, now())
  where country_id is null
     or state_id is null
     or city is null
     or studio_name is null
     or whatsapp_number is null;

-- Old free-typed columns are superseded by country_id/state_id above.
alter table public.photographer_profiles
  drop column country,
  drop column state;

alter table public.photographer_profiles
  alter column country_id set not null,
  alter column state_id set not null,
  alter column city set not null,
  alter column studio_name set not null,
  alter column whatsapp_number set not null;

create index photographer_profiles_country_id_idx on public.photographer_profiles (country_id);
create index photographer_profiles_state_id_idx on public.photographer_profiles (state_id);
