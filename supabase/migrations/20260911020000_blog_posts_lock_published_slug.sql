-- Blog system, Phase 3 fix (additive follow-up to 20260911000000_blog_system.sql
-- and 20260911010000_blog_system_fixes.sql): the admin CMS already refuses to
-- change blog_posts.slug once a post has ever been published (see
-- updateBlogPost in src/app/admin/(shell)/blog/actions.ts, which checks
-- OLD.published_at before issuing the UPDATE), but that check-then-write is
-- application-level and racy — two concurrent requests (or any future direct
-- DB write) could both read published_at as set, then both proceed, or a
-- request could race the publish itself. The database must be the final,
-- unconditional enforcement layer, not just the app.
--
-- This trigger rejects any UPDATE that changes slug on a row whose OLD
-- published_at is already set, full stop — no window, no app-layer bypass
-- possible. Draft posts (published_at still null) are unaffected: their
-- slug remains freely editable, exactly as before.

create function public.blog_posts_lock_published_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.published_at is not null and new.slug is distinct from old.slug then
    raise exception 'blog_posts.slug cannot be changed after the post has been published'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger blog_posts_lock_published_slug
  before update on public.blog_posts
  for each row execute function public.blog_posts_lock_published_slug();
