-- Phase 19C: star ratings on location comments. A submission now always
-- carries a 1-5 rating; the written comment text becomes optional (a
-- rating-only submission is allowed). Only APPROVED ratings count toward
-- the public average — same moderation trust boundary as comment text.

alter table public.location_comments alter column comment drop not null;

-- Default only matters for the ADD COLUMN backfill of any pre-existing
-- rows; the app always sends an explicit 1-5 choice going forward and
-- never relies on this default.
alter table public.location_comments
  add column rating smallint not null default 5 check (rating between 1 and 5);

-- Average + count of approved ratings for a location — used for the public
-- "X.X (N ratings)" display and the location's AggregateRating JSON-LD.
-- Aggregated in SQL rather than fetching every row, consistent with the
-- get_sponsored_photographer_page_stats/get_admin_location_comments
-- precedent from earlier phases.
create function public.get_location_rating_summary(p_location_id uuid)
returns table (average numeric, count bigint)
language sql
stable
set search_path = public
as $$
  select
    round(avg(rating)::numeric, 1) as average,
    count(*) as count
  from public.location_comments
  where location_id = p_location_id
    and status = 'approved';
$$;

grant execute on function public.get_location_rating_summary(uuid) to anon, authenticated;

-- Extend the two existing comment-listing functions to also return rating
-- (drop + recreate: return type is changing, not just the body).
drop function if exists public.get_approved_location_comments(uuid, int, int);

create function public.get_approved_location_comments(
  p_location_id uuid,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  comment text,
  rating smallint,
  created_at timestamptz,
  author_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    lc.id,
    lc.comment,
    lc.rating,
    lc.created_at,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      left(split_part(u.email, '@', 1), 2) || '***'
    ) as author_name
  from public.location_comments lc
  join auth.users u on u.id = lc.user_id
  where lc.location_id = p_location_id
    and lc.status = 'approved'
  order by lc.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_approved_location_comments(uuid, int, int) to anon, authenticated;

drop function if exists public.get_admin_location_comments(text);

create function public.get_admin_location_comments(p_status text default null)
returns table (
  id uuid,
  location_id uuid,
  location_name text,
  location_slug text,
  author_name text,
  comment text,
  rating smallint,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    lc.id,
    lc.location_id,
    l.name,
    l.slug,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      left(split_part(u.email, '@', 1), 2) || '***'
    ),
    lc.comment,
    lc.rating,
    lc.status,
    lc.created_at
  from public.location_comments lc
  join public.locations l on l.id = lc.location_id
  join auth.users u on u.id = lc.user_id
  where p_status is null or lc.status = p_status
  order by lc.created_at desc;
end;
$$;

grant execute on function public.get_admin_location_comments(text) to authenticated;
