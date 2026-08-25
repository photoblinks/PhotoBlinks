-- PhotoBlinks initial schema: categories, states, cities, locations, studios, and RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Geography: states, cities
-- ---------------------------------------------------------------------------

create table public.states (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  country text not null default 'India',
  is_active boolean not null default true,
  unique (country, slug)
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.states (id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  unique (state_id, slug)
);

create index cities_state_id_idx on public.cities (state_id);

-- ---------------------------------------------------------------------------
-- Categories (Beach, Temple, Waterfall, Mountain, Hill, ...)
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Locations (natural categories: beach, temple, waterfall, hill, mountain...)
-- ---------------------------------------------------------------------------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  category_id uuid references public.categories (id) on delete restrict,
  pricing_type text not null default 'unknown' check (pricing_type in ('free', 'paid', 'unknown')),
  price numeric,
  country text not null default 'India',
  state_id uuid references public.states (id) on delete restrict,
  city_id uuid references public.cities (id) on delete restrict,
  map_url text,
  latitude numeric,
  longitude numeric,
  youtube_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index locations_category_id_idx on public.locations (category_id);
create index locations_state_id_idx on public.locations (state_id);
create index locations_city_id_idx on public.locations (city_id);
create index locations_is_published_idx on public.locations (is_published);

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

create table public.location_images (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index location_images_location_id_idx on public.location_images (location_id, sort_order);

-- ---------------------------------------------------------------------------
-- Studios (preset locations: no category, list-based pricing, state/city only)
-- ---------------------------------------------------------------------------

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  country text not null default 'India',
  state_id uuid references public.states (id) on delete restrict,
  city_id uuid references public.cities (id) on delete restrict,
  map_url text,
  latitude numeric,
  longitude numeric,
  youtube_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studios_state_id_idx on public.studios (state_id);
create index studios_city_id_idx on public.studios (city_id);
create index studios_is_published_idx on public.studios (is_published);

create trigger studios_set_updated_at
  before update on public.studios
  for each row execute function public.set_updated_at();

create table public.studio_images (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index studio_images_studio_id_idx on public.studio_images (studio_id, sort_order);

create table public.studio_pricing_options (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  label text not null,
  price numeric not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index studio_pricing_options_studio_id_idx on public.studio_pricing_options (studio_id, sort_order);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.admins enable row level security;
alter table public.states enable row level security;
alter table public.cities enable row level security;
alter table public.categories enable row level security;
alter table public.locations enable row level security;
alter table public.location_images enable row level security;
alter table public.studios enable row level security;
alter table public.studio_images enable row level security;
alter table public.studio_pricing_options enable row level security;

-- admins: only admins can see the admin list; nobody self-inserts (seeded via service role)
create policy admins_admin_read on public.admins
  for select using (public.is_admin());

-- states
create policy states_public_read on public.states
  for select using (is_active = true);
create policy states_admin_all on public.states
  for all using (public.is_admin()) with check (public.is_admin());

-- cities
create policy cities_public_read on public.cities
  for select using (is_active = true);
create policy cities_admin_all on public.cities
  for all using (public.is_admin()) with check (public.is_admin());

-- categories
create policy categories_public_read on public.categories
  for select using (is_active = true);
create policy categories_admin_all on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- locations
create policy locations_public_read on public.locations
  for select using (is_published = true);
create policy locations_admin_all on public.locations
  for all using (public.is_admin()) with check (public.is_admin());

-- location_images
create policy location_images_public_read on public.location_images
  for select using (
    exists (
      select 1 from public.locations l
      where l.id = location_images.location_id and l.is_published = true
    )
  );
create policy location_images_admin_all on public.location_images
  for all using (public.is_admin()) with check (public.is_admin());

-- studios
create policy studios_public_read on public.studios
  for select using (is_published = true);
create policy studios_admin_all on public.studios
  for all using (public.is_admin()) with check (public.is_admin());

-- studio_images
create policy studio_images_public_read on public.studio_images
  for select using (
    exists (
      select 1 from public.studios s
      where s.id = studio_images.studio_id and s.is_published = true
    )
  );
create policy studio_images_admin_all on public.studio_images
  for all using (public.is_admin()) with check (public.is_admin());

-- studio_pricing_options
create policy studio_pricing_options_public_read on public.studio_pricing_options
  for select using (
    exists (
      select 1 from public.studios s
      where s.id = studio_pricing_options.studio_id and s.is_published = true
    )
  );
create policy studio_pricing_options_admin_all on public.studio_pricing_options
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed: initial states, cities, categories
-- ---------------------------------------------------------------------------

insert into public.states (name, slug, country) values
  ('Karnataka', 'karnataka', 'India'),
  ('Kerala', 'kerala', 'India');

insert into public.categories (name, slug, description, sort_order) values
  ('Beach', 'beach', 'Sandy shorelines and coastal views, ideal for beach photoshoots.', 1),
  ('Temple', 'temple', 'Historic and cultural temple architecture.', 2),
  ('Waterfall', 'waterfall', 'Natural waterfalls surrounded by greenery.', 3),
  ('Mountain', 'mountain', 'Scenic mountain backdrops.', 4),
  ('Hill', 'hill', 'Hill stations and elevated scenic viewpoints.', 5);
