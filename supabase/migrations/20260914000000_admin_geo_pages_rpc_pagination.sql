-- Phase B4: the Country/State/City Pages admin lists each fetched every
-- published location just to bucket-count them by country_id/state_id/
-- city_id in TypeScript (a Map over the full published-locations table).
-- Same fix as Phase B3's SEO inventories: move the published-location
-- count to a SQL GROUP BY and paginate at the database level, since city
-- count especially is expected to grow well past one page as coverage
-- expands beyond Karnataka/Kerala.
--
-- Same is_admin() guard, security definer + explicit auth-check pattern,
-- and `set search_path = public` convention as every other admin RPC.

create function public.get_admin_country_pages_inventory(
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  location_count bigint
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
  select co.id, co.name, co.slug, count(*)::bigint as location_count
  from public.locations l
  join public.countries co on co.id = l.country_id
  where l.is_published = true
  group by co.id, co.name, co.slug
  order by co.name asc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_country_pages_inventory(int, int) to authenticated;

create function public.get_admin_country_pages_inventory_count()
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from (
    select 1
    from public.locations l
    where l.is_published = true
    group by l.country_id
  ) combos;

  return result;
end;
$$;

grant execute on function public.get_admin_country_pages_inventory_count() to authenticated;

create function public.get_admin_state_pages_inventory(
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  country_slug text,
  location_count bigint
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
  select st.id, st.name, st.slug, co.slug, count(*)::bigint as location_count
  from public.locations l
  join public.states st on st.id = l.state_id
  join public.countries co on co.id = st.country_id
  where l.is_published = true
  group by st.id, st.name, st.slug, co.slug
  order by st.name asc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_state_pages_inventory(int, int) to authenticated;

create function public.get_admin_state_pages_inventory_count()
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from (
    select 1
    from public.locations l
    where l.is_published = true
    group by l.state_id
  ) combos;

  return result;
end;
$$;

grant execute on function public.get_admin_state_pages_inventory_count() to authenticated;

create function public.get_admin_city_pages_inventory(
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  state_slug text,
  country_slug text,
  location_count bigint
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
  select ci.id, ci.name, ci.slug, st.slug, co.slug, count(*)::bigint as location_count
  from public.locations l
  join public.cities ci on ci.id = l.city_id
  join public.states st on st.id = ci.state_id
  join public.countries co on co.id = st.country_id
  where l.is_published = true
  group by ci.id, ci.name, ci.slug, st.slug, co.slug
  order by ci.name asc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_city_pages_inventory(int, int) to authenticated;

create function public.get_admin_city_pages_inventory_count()
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from (
    select 1
    from public.locations l
    where l.is_published = true
    group by l.city_id
  ) combos;

  return result;
end;
$$;

grant execute on function public.get_admin_city_pages_inventory_count() to authenticated;
