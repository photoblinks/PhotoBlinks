-- Site-wide settings the admin can manage, starting with the homepage hero
-- banner image. Single-row table: id is a boolean that must be true, so
-- Postgres itself enforces there is ever only one row.

create table public.site_settings (
  id boolean primary key default true check (id),
  hero_image_url text,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (true);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

create policy site_settings_public_read on public.site_settings
  for select using (true);

create policy site_settings_admin_all on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());
