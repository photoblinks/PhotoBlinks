-- Phase 19D: show the full email local-part (everything before "@") as the
-- fallback comment author name for accounts with no Google-provided
-- display name, instead of a masked "sh***" prefix — explicit product
-- decision, replacing the earlier privacy-conservative default from Phase
-- 19B/19C. Still never exposes the email domain or the raw email address
-- itself, and Google-linked accounts continue to show their real name
-- exactly as before (unchanged).
-- CREATE OR REPLACE, not DROP+CREATE: only the function bodies change, the
-- signatures/return columns are identical to the versions already in
-- 20260906000000_location_comments.sql / 20260907000000_location_comment_ratings.sql.

create or replace function public.get_approved_location_comments(
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
      split_part(u.email, '@', 1)
    ) as author_name
  from public.location_comments lc
  join auth.users u on u.id = lc.user_id
  where lc.location_id = p_location_id
    and lc.status = 'approved'
  order by lc.created_at desc
  limit p_limit offset p_offset;
$$;

create or replace function public.get_admin_location_comments(p_status text default null)
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
      split_part(u.email, '@', 1)
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
