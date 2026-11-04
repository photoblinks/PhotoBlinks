-- Public photographer directory (phase 1): profile fields + slugs + a
-- service-role-only public read function.
--
-- 1. New pre-wedding fields on photographer_profiles (all optional, additive):
--    starting_price, experience_years, services, languages,
--    travels_to_other_cities. Allowed service/language values are validated by
--    the app against a fixed list; the DB bounds sizes only.
-- 2. slug: unique per photographer, generated once from studio name + city by
--    a trigger and never changed afterwards (so public URLs stay stable).
--    Existing rows are backfilled.
-- 3. get_public_photographers(p_slug): the ONLY public read path. Returns only
--    profiles that are active, not suspended, email-verified (or signed in
--    through a non-email provider) and in an active country/state. The phone
--    and WhatsApp numbers are returned only for a single-slug lookup (detail
--    page), never in the listing. Executable by service_role only, matching
--    the other public RPCs after 20261007000000_close_anon_bulk_exposure.sql.
--
-- Reversible via: drop function public.get_public_photographers(text);
-- drop trigger photographer_profiles_set_slug on public.photographer_profiles;
-- drop function public.photographer_profiles_set_slug();
-- drop function public.slugify_text(text);
-- alter table public.photographer_profiles drop column slug, drop column
-- starting_price, drop column experience_years, drop column services,
-- drop column languages, drop column travels_to_other_cities;

alter table public.photographer_profiles
  add column slug                   text,
  add column starting_price         integer,
  add column experience_years       smallint,
  add column services               text[] not null default '{}',
  add column languages              text[] not null default '{}',
  add column travels_to_other_cities boolean not null default false,
  add constraint photographer_profiles_starting_price_check
    check (starting_price is null or starting_price between 0 and 10000000),
  add constraint photographer_profiles_experience_years_check
    check (experience_years is null or experience_years between 0 and 60),
  add constraint photographer_profiles_services_check check (cardinality(services) <= 12),
  add constraint photographer_profiles_languages_check check (cardinality(languages) <= 12);

create function public.slugify_text(p text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create function public.photographer_profiles_set_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 1;
begin
  if new.slug is not null then
    return new;
  end if;

  v_base := left(public.slugify_text(new.studio_name || ' ' || new.city), 80);
  if v_base = '' then
    v_base := 'photographer';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.photographer_profiles where slug = v_slug and id <> new.id) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

create trigger photographer_profiles_set_slug
  before insert or update on public.photographer_profiles
  for each row execute function public.photographer_profiles_set_slug();

-- Backfill existing profiles (fires the trigger; no other column changes).
update public.photographer_profiles set slug = null where slug is null;

alter table public.photographer_profiles alter column slug set not null;
create unique index photographer_profiles_slug_uq on public.photographer_profiles (slug);

create function public.get_public_photographers(p_slug text default null)
returns table (
  id                     uuid,
  slug                   text,
  display_name           text,
  studio_name            text,
  bio                    text,
  avatar_url             text,
  instagram_url          text,
  portfolio_url          text,
  phone_number           text,
  whatsapp_number        text,
  city                   text,
  city_slug              text,
  state_name             text,
  state_slug             text,
  country_name           text,
  country_slug           text,
  starting_price         integer,
  experience_years       smallint,
  services               text[],
  languages              text[],
  travels_to_other_cities boolean,
  created_at             timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.slug,
    p.display_name,
    p.studio_name,
    p.bio,
    p.avatar_url,
    p.instagram_url,
    p.portfolio_url,
    case when p_slug is not null then p.phone_number end,
    case when p_slug is not null then p.whatsapp_number end,
    p.city,
    public.slugify_text(p.city),
    s.name,
    s.slug,
    c.name,
    c.slug,
    p.starting_price,
    p.experience_years,
    p.services,
    p.languages,
    p.travels_to_other_cities,
    p.created_at
  from public.photographer_profiles p
  join public.states s on s.id = p.state_id and s.is_active
  join public.countries c on c.id = p.country_id and c.is_active
  where p.is_active
    and p.suspended_at is null
    and (p_slug is null or p.slug = p_slug)
    and (
      exists (select 1 from public.email_verifications v where v.user_id = p.user_id)
      or exists (
        select 1 from auth.users u
        where u.id = p.user_id
          and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
      )
    )
  order by p.created_at desc;
$$;

revoke execute on function public.get_public_photographers(text) from public, anon, authenticated;
grant execute on function public.get_public_photographers(text) to service_role;
