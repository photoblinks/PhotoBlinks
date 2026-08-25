-- Homepage hero banner becomes a slider: an ordered list of images instead
-- of the single site_settings.hero_image_url. That column is left in place
-- (unused going forward) rather than dropped, and any existing value is
-- carried over as the first slide.

create table public.site_banner_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index site_banner_images_sort_order_idx on public.site_banner_images (sort_order);

insert into public.site_banner_images (image_url, sort_order)
select hero_image_url, 0 from public.site_settings where hero_image_url is not null;

alter table public.site_banner_images enable row level security;

create policy site_banner_images_public_read on public.site_banner_images
  for select using (true);

create policy site_banner_images_admin_all on public.site_banner_images
  for all using (public.is_admin()) with check (public.is_admin());
