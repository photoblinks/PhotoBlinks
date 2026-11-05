-- Editor profiles (E-E-A-T): a named, public author with photo, role, short
-- bio and social accounts. Shown on blog posts and editorial blog sections,
-- with its own /editors/[slug] page and Person structured data.
--
-- One editor can be the site default (shown wherever a piece has no specific
-- editor chosen). Blog posts may pick a specific editor; editorial blogs
-- always use the default.
--
-- Additive. Reversible via:
--   alter table public.blog_posts drop column editor_id;
--   drop table public.editors;

create table public.editors (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  role_title    text,
  image_url     text,
  bio           text,
  instagram_url text,
  youtube_url   text,
  x_url         text,
  linkedin_url  text,
  facebook_url  text,
  website_url   text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- At most one default editor.
create unique index editors_single_default_uq on public.editors (is_default) where is_default;

create trigger editors_set_updated_at
  before update on public.editors
  for each row execute function public.set_updated_at();

alter table public.editors enable row level security;

create policy editors_public_read on public.editors for select using (true);
create policy editors_admin_all on public.editors
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.blog_posts
  add column editor_id uuid references public.editors (id) on delete set null;
