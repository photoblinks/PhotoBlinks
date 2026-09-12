-- Blog system, Phase 1 audit fixes (additive follow-up to 20260911000000_blog_system.sql):
-- 1. blog_post_locations_public_read now ALSO requires the referenced location
--    to be published (locations.is_published = true) — mirrors the
--    parent-published pattern of location_images_public_read and the
--    published-location guard in pps_photographer_insert. Prevents a published
--    article's join row from exposing location_id UUIDs of unpublished/draft
--    locations to anon/authenticated readers.
-- 2. blog_posts: BEFORE INSERT OR UPDATE trigger guarantees a non-null
--    published_at whenever status becomes 'published'. Existing published_at
--    values are preserved across draft -> published -> draft -> published
--    cycles (only set when null). Keeps published posts out of the
--    NULL-sorts-first pitfall in ORDER BY published_at DESC listings.

-- ---------------------------------------------------------------------------
-- Fix 1: blog_post_locations_public_read — require published location
-- ---------------------------------------------------------------------------

drop policy blog_post_locations_public_read on public.blog_post_locations;

create policy blog_post_locations_public_read on public.blog_post_locations
  for select using (
    exists (
      select 1 from public.blog_posts p
      where p.id = blog_post_locations.post_id and p.status = 'published'
    )
    and exists (
      select 1 from public.locations l
      where l.id = blog_post_locations.location_id and l.is_published = true
    )
  );

-- ---------------------------------------------------------------------------
-- Fix 2: blog_posts.published_at — set on publish, preserve existing value
-- ---------------------------------------------------------------------------

create function public.blog_posts_set_published_at()
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

create trigger blog_posts_set_published_at
  before insert or update on public.blog_posts
  for each row execute function public.blog_posts_set_published_at();