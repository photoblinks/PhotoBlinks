-- Blog system, Phase 1: schema + RLS only. No editor/renderer, no seed content.
-- Mirrors the locations/location_faqs conventions: public read gated on a
-- published-state predicate, admin full access via public.is_admin(),
-- updated_at maintained by the existing public.set_updated_at() trigger.
-- Purely additive — does not touch locations, categories, or any existing table.

-- ---------------------------------------------------------------------------
-- blog_categories
-- ---------------------------------------------------------------------------

create table public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger blog_categories_set_updated_at
  before update on public.blog_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- blog_tags
-- ---------------------------------------------------------------------------

create table public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger blog_tags_set_updated_at
  before update on public.blog_tags
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- blog_posts
-- ---------------------------------------------------------------------------

create table public.blog_posts (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  excerpt             text,
  content             jsonb not null default '[]',
  content_version     integer not null default 1,
  category_id         uuid references public.blog_categories (id) on delete restrict,
  author_name         text not null,
  author_id           uuid references auth.users (id) on delete set null,
  featured_image_url  text,
  featured_image_alt  text,
  meta_title          text,
  meta_description    text,
  is_featured         boolean not null default false,
  status              text not null default 'draft' check (status in ('draft', 'published')),
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Published-post listing (newest first)
create index blog_posts_status_published_at_idx
  on public.blog_posts (status, published_at desc);

-- Featured published posts (e.g. homepage/blog-landing highlight rail)
create index blog_posts_featured_published_idx
  on public.blog_posts (published_at desc)
  where status = 'published' and is_featured = true;

create index blog_posts_category_id_idx on public.blog_posts (category_id);

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- blog_faqs — mirrors location_faqs
-- ---------------------------------------------------------------------------

create table public.blog_faqs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index blog_faqs_post_id_idx on public.blog_faqs (post_id, sort_order);

create trigger blog_faqs_set_updated_at
  before update on public.blog_faqs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- blog_post_tags
-- ---------------------------------------------------------------------------

create table public.blog_post_tags (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  tag_id  uuid not null references public.blog_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

create index blog_post_tags_tag_id_idx on public.blog_post_tags (tag_id);

-- ---------------------------------------------------------------------------
-- blog_post_locations
-- ---------------------------------------------------------------------------

create table public.blog_post_locations (
  post_id     uuid not null references public.blog_posts (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  primary key (post_id, location_id)
);

create index blog_post_locations_location_id_idx on public.blog_post_locations (location_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.blog_categories enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_faqs enable row level security;
alter table public.blog_post_tags enable row level security;
alter table public.blog_post_locations enable row level security;

-- blog_categories
create policy blog_categories_public_read on public.blog_categories
  for select using (is_active = true);
create policy blog_categories_admin_all on public.blog_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- blog_tags
create policy blog_tags_public_read on public.blog_tags
  for select using (is_active = true);
create policy blog_tags_admin_all on public.blog_tags
  for all using (public.is_admin()) with check (public.is_admin());

-- blog_posts: no public/authenticated insert/update/delete policy exists —
-- only the admin ALL policy grants write access, so drafts are unreachable
-- by anon/authenticated at the DB level regardless of application code.
create policy blog_posts_public_read on public.blog_posts
  for select using (status = 'published');
create policy blog_posts_admin_all on public.blog_posts
  for all using (public.is_admin()) with check (public.is_admin());

-- blog_faqs
create policy blog_faqs_public_read on public.blog_faqs
  for select using (
    exists (
      select 1 from public.blog_posts p
      where p.id = blog_faqs.post_id and p.status = 'published'
    )
  );
create policy blog_faqs_admin_all on public.blog_faqs
  for all using (public.is_admin()) with check (public.is_admin());

-- blog_post_tags
create policy blog_post_tags_public_read on public.blog_post_tags
  for select using (
    exists (
      select 1 from public.blog_posts p
      where p.id = blog_post_tags.post_id and p.status = 'published'
    )
  );
create policy blog_post_tags_admin_all on public.blog_post_tags
  for all using (public.is_admin()) with check (public.is_admin());

-- blog_post_locations
create policy blog_post_locations_public_read on public.blog_post_locations
  for select using (
    exists (
      select 1 from public.blog_posts p
      where p.id = blog_post_locations.post_id and p.status = 'published'
    )
  );
create policy blog_post_locations_admin_all on public.blog_post_locations
  for all using (public.is_admin()) with check (public.is_admin());
