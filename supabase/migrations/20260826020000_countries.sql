-- Country → State → City hierarchy. Introduces a real countries table
-- (was previously just a free-typed "country" text column on states,
-- locations, and studios, with no relationship enforced between them).
-- Both local and production have zero location/studio rows at the time of
-- writing, so backfill here is trivial and safe either way.

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.countries (name, code, slug) values ('India', 'IN', 'india');

-- states: replace the free-typed "country" text column with a real FK.
alter table public.states add column country_id uuid references public.countries (id) on delete restrict;
update public.states set country_id = (select id from public.countries where slug = 'india');
alter table public.states alter column country_id set not null;
alter table public.states drop constraint states_country_slug_key;
alter table public.states add constraint states_country_id_slug_key unique (country_id, slug);
alter table public.states drop column country;

-- locations: same replacement, backfilled from the location's own state so
-- country/state can never disagree. state_id/city_id were only required at
-- the application level before — enforcing not null here too so the
-- Country → State → City → Location hierarchy can never be partial.
alter table public.locations add column country_id uuid references public.countries (id) on delete restrict;
update public.locations l set country_id = s.country_id from public.states s where s.id = l.state_id;
alter table public.locations alter column country_id set not null;
alter table public.locations alter column state_id set not null;
alter table public.locations alter column city_id set not null;
alter table public.locations drop column country;

-- studios: same replacement.
alter table public.studios add column country_id uuid references public.countries (id) on delete restrict;
update public.studios t set country_id = s.country_id from public.states s where s.id = t.state_id;
alter table public.studios alter column country_id set not null;
alter table public.studios alter column state_id set not null;
alter table public.studios alter column city_id set not null;
alter table public.studios drop column country;

create index locations_country_id_idx on public.locations (country_id);
create index studios_country_id_idx on public.studios (country_id);

alter table public.countries enable row level security;

create policy countries_public_read on public.countries
  for select using (is_active = true);
create policy countries_admin_all on public.countries
  for all using (public.is_admin()) with check (public.is_admin());
