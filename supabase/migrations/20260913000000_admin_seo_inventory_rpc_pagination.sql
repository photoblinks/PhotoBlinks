-- Phase B3: replace the SEO inventory pages' "fetch every published
-- location, aggregate/filter/sort/slice in TypeScript" path with real
-- database-side GROUP BY + LIMIT/OFFSET pagination.
--
-- One row per (city, category) combination for the City + Category
-- inventory, and one row per (state, category) combination for the State +
-- Category inventory — same grouping semantics the existing TypeScript
-- Map-based aggregation used (src/app/admin/(shell)/seo/location-categories
-- and .../location-state-categories), just computed in SQL instead of by
-- fetching every published location row.
--
-- Same is_admin() guard, security definer + explicit auth-check pattern,
-- and `set search_path = public` convention as every other admin RPC in
-- this project (get_admin_location_comments, get_admin_location_reports,
-- etc). Read-only, no RLS/authorization change.

create function public.get_admin_seo_location_category_inventory(
  p_q text default null,
  p_country_slug text default null,
  p_state_slug text default null,
  p_city_slug text default null,
  p_category_slug text default null,
  p_sort text default 'city',
  p_dir text default 'asc',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  city_id uuid,
  category_id uuid,
  country_name text,
  country_slug text,
  state_name text,
  state_slug text,
  city_name text,
  city_slug text,
  category_name text,
  category_slug text,
  location_count bigint,
  seo_title text,
  seo_description text
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
    l.city_id,
    l.category_id,
    co.name,
    co.slug,
    st.name,
    st.slug,
    ci.name,
    ci.slug,
    ca.name,
    ca.slug,
    count(*)::bigint as location_count,
    seo.meta_title,
    seo.meta_description
  from public.locations l
  join public.countries co on co.id = l.country_id
  join public.states st on st.id = l.state_id
  join public.cities ci on ci.id = l.city_id
  join public.categories ca on ca.id = l.category_id
  left join public.location_category_seo seo
    on seo.city_id = l.city_id and seo.category_id = l.category_id
  where l.is_published = true
    and (p_country_slug is null or co.slug = p_country_slug)
    and (p_state_slug is null or st.slug = p_state_slug)
    and (p_city_slug is null or ci.slug = p_city_slug)
    and (p_category_slug is null or ca.slug = p_category_slug)
    and (
      p_q is null or p_q = ''
      or ci.name ilike '%' || p_q || '%'
      or st.name ilike '%' || p_q || '%'
      or ca.name ilike '%' || p_q || '%'
      or co.name ilike '%' || p_q || '%'
    )
  group by l.city_id, l.category_id, co.name, co.slug, st.name, st.slug, ci.name, ci.slug,
    ca.name, ca.slug, seo.meta_title, seo.meta_description
  -- p_sort/p_dir are constant for the whole call, so exactly one of these
  -- six case-when columns is non-null for every row; the other five are
  -- null for every row and drop out of the ordering. City/category name
  -- are appended as a safe deterministic tie-break that doesn't change the
  -- intended primary order.
  order by
    case when p_sort = 'city' and p_dir = 'asc' then ci.name end asc,
    case when p_sort = 'city' and p_dir = 'desc' then ci.name end desc,
    case when p_sort = 'category' and p_dir = 'asc' then ca.name end asc,
    case when p_sort = 'category' and p_dir = 'desc' then ca.name end desc,
    case when p_sort = 'count' and p_dir = 'asc' then count(*) end asc,
    case when p_sort = 'count' and p_dir = 'desc' then count(*) end desc,
    ci.name asc,
    ca.name asc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_seo_location_category_inventory(text, text, text, text, text, text, text, int, int) to authenticated;

create function public.get_admin_seo_location_category_inventory_count(
  p_q text default null,
  p_country_slug text default null,
  p_state_slug text default null,
  p_city_slug text default null,
  p_category_slug text default null
)
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
    join public.countries co on co.id = l.country_id
    join public.states st on st.id = l.state_id
    join public.cities ci on ci.id = l.city_id
    join public.categories ca on ca.id = l.category_id
    where l.is_published = true
      and (p_country_slug is null or co.slug = p_country_slug)
      and (p_state_slug is null or st.slug = p_state_slug)
      and (p_city_slug is null or ci.slug = p_city_slug)
      and (p_category_slug is null or ca.slug = p_category_slug)
      and (
        p_q is null or p_q = ''
        or ci.name ilike '%' || p_q || '%'
        or st.name ilike '%' || p_q || '%'
        or ca.name ilike '%' || p_q || '%'
        or co.name ilike '%' || p_q || '%'
      )
    group by l.city_id, l.category_id
  ) combos;

  return result;
end;
$$;

grant execute on function public.get_admin_seo_location_category_inventory_count(text, text, text, text, text) to authenticated;

-- Distinct (country, state, city, category) tuples among ALL published
-- locations, regardless of the currently active q/country/state/city/
-- category filters — feeds the filter dropdowns, which must always offer
-- every option the inventory could contain. Mirrors the previous
-- unfiltered-scan comment ("regardless of the currently applied filters"),
-- but returns distinct combinations instead of one row per location.
create function public.get_admin_seo_location_category_filter_options()
returns table (
  country_name text,
  country_slug text,
  state_name text,
  state_slug text,
  city_name text,
  city_slug text,
  category_name text,
  category_slug text
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
  select distinct co.name, co.slug, st.name, st.slug, ci.name, ci.slug, ca.name, ca.slug
  from public.locations l
  join public.countries co on co.id = l.country_id
  join public.states st on st.id = l.state_id
  join public.cities ci on ci.id = l.city_id
  join public.categories ca on ca.id = l.category_id
  where l.is_published = true;
end;
$$;

grant execute on function public.get_admin_seo_location_category_filter_options() to authenticated;

create function public.get_admin_seo_location_state_category_inventory(
  p_q text default null,
  p_country_slug text default null,
  p_state_slug text default null,
  p_category_slug text default null,
  p_sort text default 'state',
  p_dir text default 'asc',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  state_id uuid,
  category_id uuid,
  country_name text,
  country_slug text,
  state_name text,
  state_slug text,
  category_name text,
  category_slug text,
  location_count bigint,
  seo_title text,
  seo_description text
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
    l.state_id,
    l.category_id,
    co.name,
    co.slug,
    st.name,
    st.slug,
    ca.name,
    ca.slug,
    count(*)::bigint as location_count,
    seo.meta_title,
    seo.meta_description
  from public.locations l
  join public.countries co on co.id = l.country_id
  join public.states st on st.id = l.state_id
  join public.categories ca on ca.id = l.category_id
  left join public.location_state_category_seo seo
    on seo.state_id = l.state_id and seo.category_id = l.category_id
  where l.is_published = true
    and (p_country_slug is null or co.slug = p_country_slug)
    and (p_state_slug is null or st.slug = p_state_slug)
    and (p_category_slug is null or ca.slug = p_category_slug)
    and (
      p_q is null or p_q = ''
      or st.name ilike '%' || p_q || '%'
      or ca.name ilike '%' || p_q || '%'
      or co.name ilike '%' || p_q || '%'
    )
  group by l.state_id, l.category_id, co.name, co.slug, st.name, st.slug, ca.name, ca.slug,
    seo.meta_title, seo.meta_description
  order by
    case when p_sort = 'state' and p_dir = 'asc' then st.name end asc,
    case when p_sort = 'state' and p_dir = 'desc' then st.name end desc,
    case when p_sort = 'category' and p_dir = 'asc' then ca.name end asc,
    case when p_sort = 'category' and p_dir = 'desc' then ca.name end desc,
    case when p_sort = 'count' and p_dir = 'asc' then count(*) end asc,
    case when p_sort = 'count' and p_dir = 'desc' then count(*) end desc,
    st.name asc,
    ca.name asc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_admin_seo_location_state_category_inventory(text, text, text, text, text, text, int, int) to authenticated;

create function public.get_admin_seo_location_state_category_inventory_count(
  p_q text default null,
  p_country_slug text default null,
  p_state_slug text default null,
  p_category_slug text default null
)
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
    join public.countries co on co.id = l.country_id
    join public.states st on st.id = l.state_id
    join public.categories ca on ca.id = l.category_id
    where l.is_published = true
      and (p_country_slug is null or co.slug = p_country_slug)
      and (p_state_slug is null or st.slug = p_state_slug)
      and (p_category_slug is null or ca.slug = p_category_slug)
      and (
        p_q is null or p_q = ''
        or st.name ilike '%' || p_q || '%'
        or ca.name ilike '%' || p_q || '%'
        or co.name ilike '%' || p_q || '%'
      )
    group by l.state_id, l.category_id
  ) combos;

  return result;
end;
$$;

grant execute on function public.get_admin_seo_location_state_category_inventory_count(text, text, text, text) to authenticated;

create function public.get_admin_seo_location_state_category_filter_options()
returns table (
  country_name text,
  country_slug text,
  state_name text,
  state_slug text,
  category_name text,
  category_slug text
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
  select distinct co.name, co.slug, st.name, st.slug, ca.name, ca.slug
  from public.locations l
  join public.countries co on co.id = l.country_id
  join public.states st on st.id = l.state_id
  join public.categories ca on ca.id = l.category_id
  where l.is_published = true;
end;
$$;

grant execute on function public.get_admin_seo_location_state_category_filter_options() to authenticated;
