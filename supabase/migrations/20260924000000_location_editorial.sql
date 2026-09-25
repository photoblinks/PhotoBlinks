-- Hybrid editorial content, Phase 4: schema + RLS only. No seed content.
--
-- Editorial (blog-style block-array) content rendered at the bottom of
-- State pages (/locations/[country]/[state]) and State + Category pages
-- (/locations/[country]/[state]/[category]). Mirrors:
--   - blog_posts (content jsonb + status/published_at draft-publish model)
--   - location_state_category_seo (keyed per (state[, category]) combination,
--     additive RLS, set_updated_at trigger)
--
-- Purely additive. Reversible via:
--   drop table public.location_editorial;
--   drop function public.location_editorial_set_published_at();
--   alter table public.site_settings drop column location_info_table_config;

-- ---------------------------------------------------------------------------
-- location_editorial
-- ---------------------------------------------------------------------------

create table public.location_editorial (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('state', 'state_category')),
  state_id     uuid not null references public.states (id) on delete cascade,
  category_id  uuid references public.categories (id) on delete cascade,
  content      jsonb not null default '[]',
  status       text not null default 'draft' check (status in ('draft', 'published')),
  constraint location_editorial_scope_category_check check (
    (scope = 'state' and category_id is null)
    or (scope = 'state_category' and category_id is not null)
  ),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per State page, one row per (State, Category) page. A composite
-- unique (scope, state_id, category_id) would NOT enforce state uniqueness
-- (category_id is NULL there, and NULLs are distinct in Postgres), so the
-- constraint is expressed as partial unique indexes instead.
create unique index location_editorial_state_uq
  on public.location_editorial (state_id)
  where scope = 'state';

create unique index location_editorial_state_category_uq
  on public.location_editorial (state_id, category_id)
  where scope = 'state_category';

create index location_editorial_state_status_idx
  on public.location_editorial (state_id, status);

create trigger location_editorial_set_updated_at
  before update on public.location_editorial
  for each row execute function public.set_updated_at();

-- published_at is set once, the first time status becomes 'published', and
-- preserved across publish -> unpublish -> publish cycles — mirrors
-- public.blog_posts_set_published_at() (20260911010000_blog_system_fixes.sql).
create function public.location_editorial_set_published_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger location_editorial_set_published_at
  before insert or update on public.location_editorial
  for each row execute function public.location_editorial_set_published_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.location_editorial enable row level security;

-- Public read: published only. Page existence is gated at the page layer
-- (the public page 404s when the geo combination has no published
-- locations), so no correlated locations subquery is needed here — drafts
-- are unreachable at the DB level regardless of application code.
create policy location_editorial_public_read on public.location_editorial
  for select using (status = 'published');

create policy location_editorial_admin_all on public.location_editorial
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Centralized location-information-table configuration. Stored on the
-- existing single-row site_settings table (same additive pattern as
-- 20260911030000_site_social_media.sql) — no new table, reuses the existing
-- site_settings_public_read / site_settings_admin_all policies and the
-- seeded set_updated_at trigger.
-- ---------------------------------------------------------------------------

alter table public.site_settings
  add column location_info_table_config jsonb;
