-- Optional per-(state, category) SEO title/description overrides for the
-- State + Category locations page (/locations/[country]/[state]/[category]).
-- Mirrors location_category_seo (Phase 2) exactly, one level up: no
-- dedicated row exists until an admin sets one; NULL means "use the
-- auto-generated default text". state_id already determines country via
-- its own FK chain, so country isn't duplicated here.

create table public.location_state_category_seo (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.states (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state_id, category_id)
);

create trigger location_state_category_seo_set_updated_at
  before update on public.location_state_category_seo
  for each row execute function public.set_updated_at();

alter table public.location_state_category_seo enable row level security;

-- Publicly readable only for combinations that currently have at least one
-- published location — the same condition the public page itself uses to
-- decide the page exists at all.
create policy location_state_category_seo_public_read on public.location_state_category_seo
  for select using (
    exists (
      select 1 from public.locations l
      where l.state_id = location_state_category_seo.state_id
        and l.category_id = location_state_category_seo.category_id
        and l.is_published = true
    )
  );
create policy location_state_category_seo_admin_all on public.location_state_category_seo
  for all using (public.is_admin()) with check (public.is_admin());
