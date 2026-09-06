-- Optional per-(city, category) SEO title/description overrides for the
-- City + Category locations page (/locations/[country]/[state]/[city]/[category]).
-- Unlike country/state/city/category pages, a city+category combination has
-- no dedicated row of its own — it only exists as a page once a location is
-- published there — so an override row exists only once an admin sets one.
-- NULL means "use the auto-generated default text". city_id already
-- determines state/country via its own FK chain, so those aren't
-- duplicated here.

create table public.location_category_seo (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, category_id)
);

create trigger location_category_seo_set_updated_at
  before update on public.location_category_seo
  for each row execute function public.set_updated_at();

alter table public.location_category_seo enable row level security;

-- Publicly readable only for combinations that currently have at least one
-- published location — the same condition the public page itself uses to
-- decide the page exists at all.
create policy location_category_seo_public_read on public.location_category_seo
  for select using (
    exists (
      select 1 from public.locations l
      where l.city_id = location_category_seo.city_id
        and l.category_id = location_category_seo.category_id
        and l.is_published = true
    )
  );
create policy location_category_seo_admin_all on public.location_category_seo
  for all using (public.is_admin()) with check (public.is_admin());
