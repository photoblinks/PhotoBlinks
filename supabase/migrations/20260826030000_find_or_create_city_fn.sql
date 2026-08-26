-- Atomic find-or-create for cities, keyed on the existing unique
-- (state_id, slug) constraint. A plain "check then insert" from the app
-- would race under concurrent requests (two admins adding "Bangalore" and
-- "bangalore" at the same instant could both pass the check before either
-- insert lands); INSERT ... ON CONFLICT DO UPDATE is atomic — Postgres
-- resolves the conflict itself, so this can never produce two rows for
-- the same state with the same normalized name.
--
-- The slug logic mirrors src/lib/slug.ts's slugify() exactly (lowercase,
-- trim, collapse non-alphanumeric runs to a single hyphen, trim hyphens)
-- so a city's slug here always matches what the app would compute.
--
-- security invoker (the default): respects the caller's own RLS, same as
-- the existing cities_admin_all policy — only an authenticated admin can
-- actually create or find-and-return a city through this function.

create or replace function public.find_or_create_city(p_state_id uuid, p_name text)
returns table (city_id uuid, city_name text, city_slug text)
language plpgsql
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_slug text;
begin
  v_slug := lower(v_name);
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');

  if v_name = '' or v_slug = '' then
    raise exception 'City name must contain at least one letter or number.';
  end if;

  return query
    insert into public.cities (state_id, name, slug)
    values (p_state_id, v_name, v_slug)
    on conflict (state_id, slug) do update set name = cities.name
    returning cities.id, cities.name, cities.slug;
end;
$$;

grant execute on function public.find_or_create_city(uuid, text) to authenticated;
