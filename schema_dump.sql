


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."activity_entity_is_published"("p_module" "text", "p_entity_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case p_module
    when 'locations' then exists (
      select 1 from public.locations l where l.id = p_entity_id and l.is_published
    )
    when 'studios' then exists (
      select 1 from public.studios s where s.id = p_entity_id and s.is_published
    )
    else false
  end;
$$;


ALTER FUNCTION "public"."activity_entity_is_published"("p_module" "text", "p_entity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_find_user_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select id
  into result
  from auth.users
  where lower(email) = lower(trim(p_email))
  order by created_at
  limit 1;

  return result;
end;
$$;


ALTER FUNCTION "public"."admin_find_user_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_photographer_claim"("p_claim_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_claim public.photographer_claim_requests;
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  select * into v_claim from public.photographer_claim_requests
    where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then
    raise exception 'This request is no longer pending.';
  end if;

  perform 1 from public.photographer_profiles where id = v_claim.profile_id for update;
  if not exists (
    select 1 from public.photographer_profiles
    where id = v_claim.profile_id and user_id is null
  ) then
    raise exception 'This profile has already been claimed.';
  end if;

  if exists (select 1 from public.photographer_profiles where user_id = v_claim.user_id) then
    raise exception 'This account already has a photographer profile.';
  end if;

  perform set_config('app.photographer_claim_approval', 'on', true);
  update public.photographer_profiles set user_id = v_claim.user_id where id = v_claim.profile_id;
  perform set_config('app.photographer_claim_approval', 'off', true);

  update public.photographer_claim_requests
    set status = 'approved', reviewed_at = now() where id = v_claim.id;
  update public.photographer_claim_requests
    set status = 'rejected', reviewed_at = now()
    where profile_id = v_claim.profile_id and status = 'pending' and id <> v_claim.id;

  insert into public.email_verifications (user_id) values (v_claim.user_id)
    on conflict do nothing;

  return v_claim.email;
end;
$$;


ALTER FUNCTION "public"."approve_photographer_claim"("p_claim_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."blog_posts_lock_published_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.published_at is not null and new.slug is distinct from old.slug then
    raise exception 'blog_posts.slug cannot be changed after the post has been published'
      using errcode = '23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."blog_posts_lock_published_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."blog_posts_set_published_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."blog_posts_set_published_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count int;
begin
  if p_key is null
     or length(p_key) > 120
     or p_key !~ '^(signup|resend|claim|reset|contact):'
     or p_limit < 1
     or p_window_seconds < 1 then
    return false;
  end if;

  delete from public.auth_rate_limits
  where id in (
    select id from public.auth_rate_limits
    where created_at < now() - interval '1 day'
    limit 200
  );

  select count(*) into v_count
  from public.auth_rate_limits
  where key = p_key
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.auth_rate_limits (key) values (p_key);
  return true;
end;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_sponsored_photographer_state_uniqueness"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform 1 from public.states where id = new.state_id for update;

  if new.expiry_date >= current_date and exists (
    select 1 from public.sponsored_photographers
    where state_id = new.state_id
      and expiry_date >= current_date
      and id <> new.id
  ) then
    raise exception 'An active sponsored photographer already exists for this state.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."check_sponsored_photographer_state_uniqueness"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_location_collection_location_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  perform pg_advisory_xact_lock(hashtext('photographer_location_collection_locations:' || new.collection_id::text));
  if (
    select count(*) from public.photographer_location_collection_locations
    where collection_id = new.collection_id
  ) >= 25 then
    raise exception 'too_many_locations'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_location_collection_location_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_photographer_location_collection_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  perform pg_advisory_xact_lock(hashtext('photographer_location_collections:' || new.photographer_id::text));
  if (
    select count(*) from public.photographer_location_collections
    where photographer_id = new.photographer_id
  ) >= 10 then
    raise exception 'share_location_limit_reached'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_photographer_location_collection_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_or_create_city"("p_state_id" "uuid", "p_name" "text") RETURNS TABLE("city_id" "uuid", "city_name" "text", "city_slug" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."find_or_create_city"("p_state_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_activity_summary"() RETURNS TABLE("user_id" "uuid", "display_name" "text", "daily_unique" bigint, "monthly_unique" bigint, "locations_count" bigint, "studios_count" bigint, "last_activity" timestamp with time zone, "monthly_actions" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_day_start   timestamptz := date_trunc('day',   now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if not public.has_permission('activity.view') then
    raise exception 'Not authorized';
  end if;

  return query
  with active_employees as (
    select e.user_id, e.full_name, u.email
    from public.employees e
    join auth.users u on u.id = e.user_id
    where e.is_active = true
  ),
  monthly_entity as (
    select
      ae.user_id,
      count(distinct (ae.entity_id, (ae.created_at at time zone 'Asia/Kolkata')::date))::bigint as monthly_unique,
      count(distinct ae.entity_id) filter (where ae.module = 'locations')::bigint as locations_count,
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as studios_count,
      count(distinct ae.entity_id) filter (where ae.created_at >= v_day_start)::bigint as daily_unique
    from public.activity_events ae
    where ae.created_at >= v_month_start
    group by ae.user_id
  ),
  monthly_action as (
    select a.user_id, jsonb_object_agg(a.action, a.cnt) as monthly_actions
    from (
      select ae.user_id, ae.action, count(*)::bigint as cnt
      from public.activity_events ae
      where ae.created_at >= v_month_start
      group by ae.user_id, ae.action
    ) a
    group by a.user_id
  ),
  last_activity as (
    select ae.user_id, max(ae.created_at) as last_activity
    from public.activity_events ae
    group by ae.user_id
  )
  select
    emp.user_id,
    coalesce(nullif(emp.full_name, ''), split_part(emp.email, '@', 1)) as display_name,
    coalesce(me.daily_unique, 0),
    coalesce(me.monthly_unique, 0),
    coalesce(me.locations_count, 0),
    coalesce(me.studios_count, 0),
    la.last_activity,
    coalesce(ma.monthly_actions, '{}'::jsonb)
  from active_employees emp
  left join monthly_entity me on me.user_id = emp.user_id
  left join monthly_action ma on ma.user_id = emp.user_id
  left join last_activity la on la.user_id = emp.user_id
  order by coalesce(me.monthly_unique, 0) desc, emp.email asc;
end;
$$;


ALTER FUNCTION "public"."get_admin_activity_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_city_pages_inventory"("p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "state_slug" "text", "country_slug" "text", "location_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_city_pages_inventory"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_city_pages_inventory_count"() RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_city_pages_inventory_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_country_pages_inventory"("p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "location_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_country_pages_inventory"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_country_pages_inventory_count"() RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_country_pages_inventory_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_employees"("p_active" boolean DEFAULT NULL::boolean, "p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "user_id" "uuid", "email" "text", "full_name" "text", "role_id" "uuid", "role_name" "text", "is_active" boolean, "invited_by" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    e.id,
    e.user_id,
    u.email::text,
    e.full_name,
    e.role_id,
    r.name,
    e.is_active,
    e.invited_by,
    e.created_at,
    e.updated_at
  from public.employees e
  join public.employee_roles r on r.id = e.role_id
  join auth.users u on u.id = e.user_id
  where (p_active is null or e.is_active = p_active)
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or coalesce(e.full_name, '') ilike '%' || p_search || '%'
    )
  order by e.created_at desc
  limit p_limit offset p_offset;
end;
$$;


ALTER FUNCTION "public"."get_admin_employees"("p_active" boolean, "p_search" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_employees_count"("p_active" boolean DEFAULT NULL::boolean, "p_search" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from public.employees e
  join auth.users u on u.id = e.user_id
  where (p_active is null or e.is_active = p_active)
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or coalesce(e.full_name, '') ilike '%' || p_search || '%'
    );

  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_employees_count"("p_active" boolean, "p_search" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_location_comments"("p_status" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "location_id" "uuid", "location_name" "text", "location_slug" "text", "author_name" "text", "comment" "text", "rating" smallint, "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  order by lc.created_at desc
  limit p_limit offset p_offset;
end;
$$;


ALTER FUNCTION "public"."get_admin_location_comments"("p_status" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_location_comments_count"("p_status" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from public.location_comments lc
  where p_status is null or lc.status = p_status;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_location_comments_count"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_location_reports"("p_status" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "location_id" "uuid", "location_name" "text", "location_slug" "text", "reporter_label" "text", "report_type" "text", "message" "text", "status" "text", "admin_note" "text", "reviewed_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    lr.id,
    lr.location_id,
    l.name,
    l.slug,
    case
      when u.id is null then 'Anonymous'
      when pp.user_id is not null then 'Photographer'
      else 'Registered user'
    end,
    lr.report_type,
    lr.message,
    lr.status,
    lr.admin_note,
    lr.reviewed_at,
    lr.created_at
  from public.location_reports lr
  join public.locations l on l.id = lr.location_id
  left join auth.users u on u.id = lr.reporter_user_id
  left join public.photographer_profiles pp on pp.user_id = lr.reporter_user_id
  where p_status is null or lr.status = p_status
  order by lr.created_at desc
  limit p_limit offset p_offset;
end;
$$;


ALTER FUNCTION "public"."get_admin_location_reports"("p_status" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_location_reports_count"("p_status" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from public.location_reports lr
  where p_status is null or lr.status = p_status;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_location_reports_count"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_nav_badge_counts"() RETURNS TABLE("pending_comments" bigint, "pending_photos" bigint, "pending_reports" bigint, "new_users" bigint, "new_photographers" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_users_seen timestamptz;
  v_photographers_seen timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  insert into public.admin_page_seen (user_id, page_key)
  values (auth.uid(), 'users'), (auth.uid(), 'photographer_profiles')
  on conflict do nothing;

  select seen_at into v_users_seen
    from public.admin_page_seen where user_id = auth.uid() and page_key = 'users';
  select seen_at into v_photographers_seen
    from public.admin_page_seen where user_id = auth.uid() and page_key = 'photographer_profiles';

  return query
  select
    (select count(*) from public.location_comments where status = 'pending'),
    (select count(*) from public.photographer_photo_submissions where status = 'pending'),
    (select count(*) from public.location_reports where status = 'pending'),
    (select count(*)
       from auth.users u
      where u.created_at > v_users_seen
        and not exists (select 1 from public.admins a where a.user_id = u.id)
        and not exists (select 1 from public.employees e where e.user_id = u.id)
        and not exists (select 1 from public.photographer_profiles p where p.user_id = u.id)
        and u.raw_user_meta_data ->> 'photographer_signup' is distinct from 'true'),
    (select count(*) from public.photographer_profiles p where p.created_at > v_photographers_seen);
end;
$$;


ALTER FUNCTION "public"."get_admin_nav_badge_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_photographer_profiles"("p_status" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT NULL::"text", "p_profile_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "user_id" "uuid", "email" "text", "display_name" "text", "studio_name" "text", "bio" "text", "phone_number" "text", "whatsapp_number" "text", "instagram_url" "text", "portfolio_url" "text", "country_id" "uuid", "state_id" "uuid", "city" "text", "country_name" "text", "state_name" "text", "is_active" boolean, "suspended_at" timestamp with time zone, "status" "text", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (public.has_permission('photographers.edit') or public.has_permission('photographers.publish')) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    p.id,
    p.user_id,
    u.email::text,
    p.display_name,
    p.studio_name,
    p.bio,
    p.phone_number,
    p.whatsapp_number,
    p.instagram_url,
    p.portfolio_url,
    p.country_id,
    p.state_id,
    p.city,
    c.name,
    s.name,
    p.is_active,
    p.suspended_at,
    case
      when p.is_active then 'active'
      when p.suspended_at is not null then 'suspended'
      when p.user_id is null then 'draft'
      else 'on_hold'
    end,
    p.created_at,
    u.last_sign_in_at
  from public.photographer_profiles p
  left join auth.users u on u.id = p.user_id
  left join public.countries c on c.id = p.country_id
  left join public.states s on s.id = p.state_id
  where (p_profile_id is null or p.id = p_profile_id)
    and (
      p_profile_id is not null
      or (p_status is null and not (p.user_id is null and not p.is_active and p.suspended_at is null))
      or (p_status = 'active' and p.is_active)
      or (p_status = 'suspended' and not p.is_active and p.suspended_at is not null)
      or (p_status = 'on_hold' and not p.is_active and p.suspended_at is null and p.user_id is not null)
      or (p_status = 'draft' and not p.is_active and p.suspended_at is null and p.user_id is null)
    )
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or p.display_name ilike '%' || p_search || '%'
      or p.studio_name ilike '%' || p_search || '%'
      or p.phone_number ilike '%' || p_search || '%'
    )
  order by p.created_at desc
  limit p_limit offset p_offset;
end;
$$;


ALTER FUNCTION "public"."get_admin_photographer_profiles"("p_status" "text", "p_search" "text", "p_profile_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_photographer_profiles_count"("p_status" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (public.has_permission('photographers.edit') or public.has_permission('photographers.publish')) then
    raise exception 'Not authorized';
  end if;

  return (
    select count(*)
    from public.photographer_profiles p
    left join auth.users u on u.id = p.user_id
    where (
        (p_status is null and not (p.user_id is null and not p.is_active and p.suspended_at is null))
        or (p_status = 'active' and p.is_active)
        or (p_status = 'suspended' and not p.is_active and p.suspended_at is not null)
        or (p_status = 'on_hold' and not p.is_active and p.suspended_at is null and p.user_id is not null)
        or (p_status = 'draft' and not p.is_active and p.suspended_at is null and p.user_id is null)
      )
      and (
        p_search is null
        or u.email ilike '%' || p_search || '%'
        or p.display_name ilike '%' || p_search || '%'
        or p.studio_name ilike '%' || p_search || '%'
        or p.phone_number ilike '%' || p_search || '%'
      )
  );
end;
$$;


ALTER FUNCTION "public"."get_admin_photographer_profiles_count"("p_status" "text", "p_search" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_photographer_submissions"("p_status" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "image_url" "text", "title" "text", "description" "text", "phone_number" "text", "status" "text", "rejection_reason" "text", "r2_deletion_status" "text", "reviewed_at" timestamp with time zone, "created_at" timestamp with time zone, "photographer_display_name" "text", "photographer_phone" "text", "location_name" "text", "location_slug" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  return query
  select
    pps.id,
    pps.image_url,
    pps.title,
    pps.description,
    pps.phone_number,
    pps.status,
    pps.rejection_reason,
    pps.r2_deletion_status,
    pps.reviewed_at,
    pps.created_at,
    pp.display_name  as photographer_display_name,
    pp.phone_number  as photographer_phone,
    l.name           as location_name,
    l.slug           as location_slug
  from public.photographer_photo_submissions pps
  join public.photographer_profiles pp on pp.user_id = pps.photographer_id
  join public.locations             l  on l.id       = pps.location_id
  where p_status is null or pps.status = p_status
  order by pps.created_at desc
  limit p_limit offset p_offset;
end;
$$;


ALTER FUNCTION "public"."get_admin_photographer_submissions"("p_status" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_photographer_submissions_count"("p_status" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result bigint;
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  select count(*)
  into result
  from public.photographer_photo_submissions pps
  where p_status is null or pps.status = p_status;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_photographer_submissions_count"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_seo_location_category_filter_options"() RETURNS TABLE("country_name" "text", "country_slug" "text", "state_name" "text", "state_slug" "text", "city_name" "text", "city_slug" "text", "category_name" "text", "category_slug" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_seo_location_category_filter_options"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_seo_location_category_inventory"("p_q" "text" DEFAULT NULL::"text", "p_country_slug" "text" DEFAULT NULL::"text", "p_state_slug" "text" DEFAULT NULL::"text", "p_city_slug" "text" DEFAULT NULL::"text", "p_category_slug" "text" DEFAULT NULL::"text", "p_sort" "text" DEFAULT 'city'::"text", "p_dir" "text" DEFAULT 'asc'::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("city_id" "uuid", "category_id" "uuid", "country_name" "text", "country_slug" "text", "state_name" "text", "state_slug" "text", "city_name" "text", "city_slug" "text", "category_name" "text", "category_slug" "text", "location_count" bigint, "seo_title" "text", "seo_description" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_seo_location_category_inventory"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_city_slug" "text", "p_category_slug" "text", "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_seo_location_category_inventory_count"("p_q" "text" DEFAULT NULL::"text", "p_country_slug" "text" DEFAULT NULL::"text", "p_state_slug" "text" DEFAULT NULL::"text", "p_city_slug" "text" DEFAULT NULL::"text", "p_category_slug" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_seo_location_category_inventory_count"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_city_slug" "text", "p_category_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_seo_location_state_category_filter_options"() RETURNS TABLE("country_name" "text", "country_slug" "text", "state_name" "text", "state_slug" "text", "category_name" "text", "category_slug" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_seo_location_state_category_filter_options"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_seo_location_state_category_inventory"("p_q" "text" DEFAULT NULL::"text", "p_country_slug" "text" DEFAULT NULL::"text", "p_state_slug" "text" DEFAULT NULL::"text", "p_category_slug" "text" DEFAULT NULL::"text", "p_sort" "text" DEFAULT 'state'::"text", "p_dir" "text" DEFAULT 'asc'::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("state_id" "uuid", "category_id" "uuid", "country_name" "text", "country_slug" "text", "state_name" "text", "state_slug" "text", "category_name" "text", "category_slug" "text", "location_count" bigint, "seo_title" "text", "seo_description" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_seo_location_state_category_inventory"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_category_slug" "text", "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_seo_location_state_category_inventory_count"("p_q" "text" DEFAULT NULL::"text", "p_country_slug" "text" DEFAULT NULL::"text", "p_state_slug" "text" DEFAULT NULL::"text", "p_category_slug" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_seo_location_state_category_inventory_count"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_category_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_state_pages_inventory"("p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "country_slug" "text", "location_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_state_pages_inventory"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_state_pages_inventory_count"() RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_state_pages_inventory_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_users"("p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "email" "text", "full_name" "text", "provider" "text", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "email_confirmed_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    u.raw_app_meta_data ->> 'provider',
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  from auth.users u
  where not exists (select 1 from public.admins a where a.user_id = u.id)
    and not exists (select 1 from public.employees e where e.user_id = u.id)
    and not exists (select 1 from public.photographer_profiles p where p.user_id = u.id)
    and u.raw_user_meta_data ->> 'photographer_signup' is distinct from 'true'
    and (
      p_search is null
      or u.email ilike '%' || p_search || '%'
      or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || p_search || '%'
    )
  order by u.created_at desc
  limit p_limit offset p_offset;
end;
$$;


ALTER FUNCTION "public"."get_admin_users"("p_search" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_users_count"("p_search" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return (
    select count(*)
    from auth.users u
    where not exists (select 1 from public.admins a where a.user_id = u.id)
      and not exists (select 1 from public.employees e where e.user_id = u.id)
      and not exists (select 1 from public.photographer_profiles p where p.user_id = u.id)
    and u.raw_user_meta_data ->> 'photographer_signup' is distinct from 'true'
      and (
        p_search is null
        or u.email ilike '%' || p_search || '%'
        or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || p_search || '%'
      )
  );
end;
$$;


ALTER FUNCTION "public"."get_admin_users_count"("p_search" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_approved_location_comments"("p_location_id" "uuid", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "comment" "text", "rating" smallint, "created_at" timestamp with time zone, "author_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_approved_location_comments"("p_location_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_approved_photographer_photos"("p_location_id" "uuid") RETURNS TABLE("id" "uuid", "image_url" "text", "title" "text", "description" "text", "phone_number" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    pps.id,
    pps.image_url,
    pps.title,
    pps.description,
    pps.phone_number
  from public.photographer_photo_submissions pps
  join public.locations l on l.id = pps.location_id
  where pps.location_id = p_location_id
    and pps.status = 'approved'
    and l.is_published = true
  order by pps.created_at desc;
$$;


ALTER FUNCTION "public"."get_approved_photographer_photos"("p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_daily_activity"("p_employee_id" "uuid" DEFAULT NULL::"uuid", "p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date") RETURNS TABLE("activity_date" "date", "locations_added" bigint, "studios_added" bigint, "photographers_added" bigint, "total_added" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Kolkata')::date);
  v_to   date := coalesce(p_to,   (now() at time zone 'Asia/Kolkata')::date);
begin
  if not (public.is_admin() or public.is_employee()) then
    raise exception 'Not authorized';
  end if;

  -- Non-admin staff only ever see their own numbers, whatever id the caller sends.
  if not public.is_admin() then
    p_employee_id := auth.uid();
  end if;

  if v_to < v_from then
    v_from := v_to;
  end if;

  return query
  with span as (
    select d::date as day
    from generate_series(v_from, v_to, interval '1 day') as d
  ),
  created as (
    select
      (ae.created_at at time zone 'Asia/Kolkata')::date as day,
      count(distinct ae.entity_id) filter (where ae.module = 'locations')::bigint as locations_added,
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as studios_added,
      count(distinct ae.entity_id) filter (where ae.module = 'photographers')::bigint as photographers_added
    from public.activity_added_events ae
    where (
        (ae.module in ('locations', 'studios') and public.activity_entity_is_published(ae.module, ae.entity_id))
        or (ae.module = 'photographers'
            and exists (select 1 from public.photographer_profiles p where p.id = ae.entity_id and p.is_active))
      )
      and (p_employee_id is null or ae.user_id = p_employee_id)
      and (ae.created_at at time zone 'Asia/Kolkata')::date >= v_from
      and (ae.created_at at time zone 'Asia/Kolkata')::date <= v_to
    group by (ae.created_at at time zone 'Asia/Kolkata')::date
  )
  select
    s.day::date as activity_date,
    coalesce(c.locations_added, 0)::bigint,
    coalesce(c.studios_added, 0)::bigint,
    coalesce(c.photographers_added, 0)::bigint,
    (coalesce(c.locations_added, 0) + coalesce(c.studios_added, 0) + coalesce(c.photographers_added, 0))::bigint
  from span s
  left join created c on c.day = s.day
  order by s.day asc;
end;
$$;


ALTER FUNCTION "public"."get_employee_daily_activity"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_performance_stats"("p_employee_id" "uuid" DEFAULT NULL::"uuid", "p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date") RETURNS TABLE("user_id" "uuid", "display_name" "text", "total_locations_added" bigint, "total_studios_added" bigint, "total_activity_days" bigint, "top_locations" "jsonb", "top_studios" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (public.is_admin() or public.is_employee()) then
    raise exception 'Not authorized';
  end if;

  -- Non-admin staff only ever see their own numbers, whatever id the caller sends.
  if not public.is_admin() then
    p_employee_id := auth.uid();
  end if;

  return query
  with emp as (
    select e.user_id,
           coalesce(nullif(e.full_name, ''), split_part(u.email::text, '@', 1)) as display_name
    from public.employees e
    join auth.users u on u.id = e.user_id
    where e.is_active = true
      and (p_employee_id is null or e.user_id = p_employee_id)
  ),
  created as (
    select ae.user_id,
      count(distinct ae.entity_id) filter (where ae.module = 'locations')::bigint as total_locations_added,
      count(distinct ae.entity_id) filter (where ae.module = 'studios')::bigint as total_studios_added
    from public.activity_added_events ae
    where public.activity_entity_is_published(ae.module, ae.entity_id)
      and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id
  ),
  days as (
    select ae.user_id,
      count(distinct (ae.created_at at time zone 'Asia/Kolkata')::date)::bigint as total_activity_days
    from public.activity_events ae
    where public.activity_entity_is_published(ae.module, ae.entity_id)
      and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id
  ),
  entity_counts as (
    select ae.user_id, ae.module, ae.entity_id,
      max(ae.metadata ->> 'name') as entity_name,
      count(*)::bigint as cnt
    from public.activity_events ae
    where public.activity_entity_is_published(ae.module, ae.entity_id)
      and (p_from is null or (ae.created_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (ae.created_at at time zone 'Asia/Kolkata')::date <= p_to)
    group by ae.user_id, ae.module, ae.entity_id
  ),
  top_locations as (
    select t.user_id,
      jsonb_agg(
        jsonb_build_object(
          'entity_id', t.entity_id,
          'name', coalesce(t.entity_name, t.entity_id::text),
          'count', t.cnt
        )
        order by t.cnt desc, coalesce(t.entity_name, '') asc
      ) as top_locations
    from (
      select ec.user_id, ec.entity_id, ec.entity_name, ec.cnt,
        row_number() over (
          partition by ec.user_id
          order by ec.cnt desc, coalesce(ec.entity_name, '') asc
        ) as rn
      from entity_counts ec
      where ec.module = 'locations'
    ) t
    where t.rn <= 5
    group by t.user_id
  ),
  top_studios as (
    select t.user_id,
      jsonb_agg(
        jsonb_build_object(
          'entity_id', t.entity_id,
          'name', coalesce(t.entity_name, t.entity_id::text),
          'count', t.cnt
        )
        order by t.cnt desc, coalesce(t.entity_name, '') asc
      ) as top_studios
    from (
      select ec.user_id, ec.entity_id, ec.entity_name, ec.cnt,
        row_number() over (
          partition by ec.user_id
          order by ec.cnt desc, coalesce(ec.entity_name, '') asc
        ) as rn
      from entity_counts ec
      where ec.module = 'studios'
    ) t
    where t.rn <= 5
    group by t.user_id
  )
  select
    emp.user_id,
    emp.display_name,
    coalesce(c.total_locations_added, 0),
    coalesce(c.total_studios_added, 0),
    coalesce(d.total_activity_days, 0),
    coalesce(tl.top_locations, '[]'::jsonb),
    coalesce(ts.top_studios, '[]'::jsonb)
  from emp
  left join created c on c.user_id = emp.user_id
  left join days d on d.user_id = emp.user_id
  left join top_locations tl on tl.user_id = emp.user_id
  left join top_studios ts on ts.user_id = emp.user_id
  order by coalesce(d.total_activity_days, 0) desc, emp.display_name asc;
end;
$$;


ALTER FUNCTION "public"."get_employee_performance_stats"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_period_summary"("p_employee_id" "uuid" DEFAULT NULL::"uuid", "p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date") RETURNS TABLE("user_id" "uuid", "display_name" "text", "range_locations_added" bigint, "range_studios_added" bigint, "range_photographers_added" bigint, "range_total_added" bigint, "week_start" "date", "week_end" "date", "week_locations_added" bigint, "week_studios_added" bigint, "week_photographers_added" bigint, "week_total_added" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Kolkata')::date);
  v_to   date := coalesce(p_to,   (now() at time zone 'Asia/Kolkata')::date);
  v_week_start date;
  v_week_end   date;
  v_days_from_ref_monday int;
  v_monday date;
  v_sunday date;
begin
  if not (public.is_admin() or public.is_employee()) then
    raise exception 'Not authorized';
  end if;

  -- Non-admin staff only ever see their own numbers, whatever id the caller sends.
  if not public.is_admin() then
    p_employee_id := auth.uid();
  end if;

  if v_to < v_from then
    v_from := v_to;
  end if;

  -- 2026-09-28 is a known Monday in Asia/Kolkata calendar.
  v_days_from_ref_monday := (v_to - date '2026-09-28')::int;
  v_monday := v_to - (((v_days_from_ref_monday % 7) + 7) % 7);
  v_sunday := v_monday + 6;

  v_week_start := greatest(v_from, v_monday);
  v_week_end   := least(v_to, v_sunday);

  return query
  with emp as (
    select e.user_id,
           coalesce(nullif(e.full_name, ''), split_part(u.email::text, '@', 1)) as display_name
    from public.employees e
    join auth.users u on u.id = e.user_id
    where e.is_active = true
      and (p_employee_id is null or e.user_id = p_employee_id)
  ),
  created as (
    select
      ae.user_id,
      (ae.created_at at time zone 'Asia/Kolkata')::date as day,
      ae.module,
      ae.entity_id
    from public.activity_added_events ae
    where ae.module in ('locations', 'studios', 'photographers')
      and (
        (ae.module in ('locations', 'studios') and public.activity_entity_is_published(ae.module, ae.entity_id))
        or (ae.module = 'photographers'
            and exists (select 1 from public.photographer_profiles p where p.id = ae.entity_id and p.is_active))
      )
      and (p_employee_id is null or ae.user_id = p_employee_id)
      and (ae.created_at at time zone 'Asia/Kolkata')::date >= v_from
      and (ae.created_at at time zone 'Asia/Kolkata')::date <= v_to
  ),
  range_counts as (
    select
      c.user_id,
      count(distinct c.entity_id) filter (where c.module = 'locations')::bigint as locations_added,
      count(distinct c.entity_id) filter (where c.module = 'studios')::bigint as studios_added,
      count(distinct c.entity_id) filter (where c.module = 'photographers')::bigint as photographers_added
    from created c
    group by c.user_id
  ),
  week_counts as (
    select
      c.user_id,
      count(distinct c.entity_id) filter (where c.module = 'locations')::bigint as locations_added,
      count(distinct c.entity_id) filter (where c.module = 'studios')::bigint as studios_added,
      count(distinct c.entity_id) filter (where c.module = 'photographers')::bigint as photographers_added
    from created c
    where c.day >= v_week_start and c.day <= v_week_end
    group by c.user_id
  )
  select
    emp.user_id,
    emp.display_name,
    coalesce(rc.locations_added, 0)::bigint,
    coalesce(rc.studios_added, 0)::bigint,
    coalesce(rc.photographers_added, 0)::bigint,
    (coalesce(rc.locations_added, 0) + coalesce(rc.studios_added, 0) + coalesce(rc.photographers_added, 0))::bigint,
    v_week_start,
    v_week_end,
    coalesce(wc.locations_added, 0)::bigint,
    coalesce(wc.studios_added, 0)::bigint,
    coalesce(wc.photographers_added, 0)::bigint,
    (coalesce(wc.locations_added, 0) + coalesce(wc.studios_added, 0) + coalesce(wc.photographers_added, 0))::bigint
  from emp
  left join range_counts rc on rc.user_id = emp.user_id
  left join week_counts wc on wc.user_id = emp.user_id
  order by (coalesce(rc.locations_added, 0) + coalesce(rc.studios_added, 0) + coalesce(rc.photographers_added, 0)) desc,
           emp.display_name asc;
end;
$$;


ALTER FUNCTION "public"."get_employee_period_summary"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_location_rating_summary"("p_location_id" "uuid") RETURNS TABLE("average" numeric, "count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    round(avg(rating)::numeric, 1) as average,
    count(*) as count
  from public.location_comments
  where location_id = p_location_id
    and status = 'approved';
$$;


ALTER FUNCTION "public"."get_location_rating_summary"("p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_location_slug_redirect"("p_old_slug" "text") RETURNS TABLE("redirect_to" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select redirect_to
  from public.location_slug_redirects
  where old_slug = p_old_slug
  limit 1;
$$;


ALTER FUNCTION "public"."get_location_slug_redirect"("p_old_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_permissions"() RETURNS SETOF "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.code
  from public.employees e
  join public.employee_role_permissions erp on erp.role_id = e.role_id
  join public.employee_permissions p on p.id = erp.permission_id
  where e.user_id = auth.uid()
    and e.is_active = true
  order by p.code;
$$;


ALTER FUNCTION "public"."get_my_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_photographers"("p_slug" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "slug" "text", "display_name" "text", "studio_name" "text", "bio" "text", "avatar_url" "text", "instagram_url" "text", "portfolio_url" "text", "phone_number" "text", "whatsapp_number" "text", "city" "text", "city_slug" "text", "state_name" "text", "state_slug" "text", "country_name" "text", "country_slug" "text", "starting_price" integer, "experience_years" smallint, "services" "text"[], "languages" "text"[], "travels_to_other_cities" boolean, "created_at" timestamp with time zone, "logo_url" "text", "banner_url" "text", "starting_actual_price" integer, "offers_pre_wedding" boolean, "offers_wedding" boolean, "is_verified" boolean, "youtube_url" "text", "seo_title" "text", "seo_description" "text", "google_business_url" "text", "google_maps_url" "text", "seo_h1" "text", "is_claimed" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    p.id,
    p.slug,
    p.display_name,
    p.studio_name,
    p.bio,
    p.avatar_url,
    p.instagram_url,
    p.portfolio_url,
    p.phone_number,
    p.whatsapp_number,
    p.city,
    public.slugify_text(p.city),
    s.name,
    s.slug,
    c.name,
    c.slug,
    pk.effective_price,
    p.experience_years,
    p.services,
    p.languages,
    p.travels_to_other_cities,
    p.created_at,
    p.logo_url,
    p.banner_url,
    pk.actual_price,
    p.offers_pre_wedding,
    p.offers_wedding,
    p.is_verified,
    p.youtube_url,
    p.seo_title,
    p.seo_description,
    p.google_business_url,
    p.google_maps_url,
    p.seo_h1,
    (p.user_id is not null)
  from public.photographer_profiles p
  join public.states s on s.id = p.state_id and s.is_active
  join public.countries c on c.id = p.country_id and c.is_active
  left join lateral (
    select coalesce(k.offer_price, k.actual_price) as effective_price, k.actual_price
    from public.photographer_packages k
    where k.photographer_id = p.user_id and k.is_visible
    order by coalesce(k.offer_price, k.actual_price)
    limit 1
  ) pk on true
  where p.is_active
    and p.suspended_at is null
    and (p_slug is null or p.slug = p_slug)
    and (
      p.user_id is null
      or exists (select 1 from public.email_verifications v where v.user_id = p.user_id)
      or exists (
        select 1 from auth.users u
        where u.id = p.user_id
          and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
      )
    )
  order by p.created_at desc;
$$;


ALTER FUNCTION "public"."get_public_photographers"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shared_favourite_location_ids"("p_token" "text") RETURNS TABLE("location_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select f.location_id
  from public.share_collections sc
  join public.favourites f on f.user_id = sc.user_id
  join public.locations l on l.id = f.location_id
  where sc.token = p_token
    and sc.revoked_at is null
    and l.is_published = true;
$$;


ALTER FUNCTION "public"."get_shared_favourite_location_ids"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shared_location_collection"("p_token" "text") RETURNS TABLE("name" "text", "display_name" "text", "studio_name" "text", "bio" "text", "avatar_url" "text", "phone_number" "text", "whatsapp_number" "text", "location_ids" "uuid"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    c.name,
    p.display_name,
    p.studio_name,
    p.bio,
    p.avatar_url,
    p.phone_number,
    p.whatsapp_number,
    coalesce(
      (
        select array_agg(cl.location_id order by cl.sort_order)
        from public.photographer_location_collection_locations cl
        join public.locations l on l.id = cl.location_id
        where cl.collection_id = c.id
          and l.is_published = true
      ),
      '{}'::uuid[]
    )
  from public.photographer_location_collections c
  join public.photographer_profiles p on p.user_id = c.photographer_id
  where c.share_token = p_token
    and p.is_active = true;
$$;


ALTER FUNCTION "public"."get_shared_location_collection"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sponsored_photographer_page_stats"("p_photographer_id" "uuid", "p_since" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("page_path" "text", "location_id" "uuid", "impressions" bigint, "call_clicks" bigint, "whatsapp_clicks" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    page_path,
    -- location_id is functionally dependent on page_path in practice (a
    -- given page always carries the same location) — no uuid max()
    -- aggregate exists in Postgres, so just take any one value per group.
    (array_agg(location_id))[1] as location_id,
    count(*) filter (where event_type = 'impression') as impressions,
    count(*) filter (where event_type = 'call_click') as call_clicks,
    count(*) filter (where event_type = 'whatsapp_click') as whatsapp_clicks
  from public.sponsored_photographer_events
  where photographer_id = p_photographer_id
    and (p_since is null or created_at >= p_since)
  group by page_path
  order by count(*) filter (where event_type = 'impression') desc;
$$;


ALTER FUNCTION "public"."get_sponsored_photographer_page_stats"("p_photographer_id" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_studio_slug_redirect"("p_old_slug" "text") RETURNS TABLE("redirect_to" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select redirect_to
  from public.studio_slug_redirects
  where old_slug = p_old_slug
  limit 1;
$$;


ALTER FUNCTION "public"."get_studio_slug_redirect"("p_old_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unverified_user_ids"("p_ids" "uuid"[]) RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_permission('photographers.publish') then
    raise exception 'Not authorized';
  end if;

  return query
  select i
  from unnest(p_ids) as i
  where not exists (select 1 from public.email_verifications v where v.user_id = i)
    and not exists (
      select 1 from auth.users u
      where u.id = i
        and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
    );
end;
$$;


ALTER FUNCTION "public"."get_unverified_user_ids"("p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.employees e
      join public.employee_role_permissions erp on erp.role_id = e.role_id
      join public.employee_permissions p on p.id = erp.permission_id
      where e.user_id = auth.uid()
        and e.is_active
        and p.code = p_code
    );
$$;


ALTER FUNCTION "public"."has_permission"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_email_verified"("p_user" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user is null then
    return false;
  end if;
  if p_user is distinct from auth.uid() and not public.has_permission('photographers.publish') then
    return false;
  end if;

  return exists (select 1 from public.email_verifications where user_id = p_user)
    or exists (
      select 1 from auth.users u
      where u.id = p_user
        and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
    );
end;
$$;


ALTER FUNCTION "public"."is_email_verified"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_employee"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.employees
    where user_id = auth.uid()
      and is_active = true
  );
$$;


ALTER FUNCTION "public"."is_employee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_photographer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.photographer_profiles
    where user_id = auth.uid()
      and suspended_at is null
  );
$$;


ALTER FUNCTION "public"."is_photographer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trusted_db_context"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select auth.uid() is null
     and (auth.role() is null or auth.role() = 'service_role')
     and exists (
       select 1 from pg_catalog.pg_roles
       where rolname = current_user and rolbypassrls
     );
$$;


ALTER FUNCTION "public"."is_trusted_db_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."location_editorial_set_published_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."location_editorial_set_published_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."locations_slug_redirects"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  dest text;
begin
  -- A slug that belongs to a live row must never be shadowed by a stale
  -- redirect entry (e.g. a slug freed by a rename/delete gets reused by a
  -- new or renamed row) — otherwise that row's own URL would loop back to
  -- whatever the old redirect pointed at instead of rendering.
  if tg_op in ('INSERT', 'UPDATE') then
    delete from public.location_slug_redirects where old_slug = new.slug;
  end if;

  if tg_op = 'UPDATE' and old.is_published and new.slug is distinct from old.slug then
    dest := '/location/' || new.slug;

    insert into public.location_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    -- Collapse any redirect that pointed at the slug being replaced so
    -- chained renames still resolve in a single hop (no redirect loops).
    update public.location_slug_redirects
    set redirect_to = dest
    where redirect_to = '/location/' || old.slug;
  end if;

  if tg_op = 'DELETE' and old.is_published then
    select '/locations/' || c.slug || '/' || s.slug || '/' || ci.slug
    into dest
    from public.countries c
    join public.states s on s.id = old.state_id
    join public.cities ci on ci.id = old.city_id
    where c.id = old.country_id;

    insert into public.location_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    update public.location_slug_redirects
    set redirect_to = dest
    where redirect_to = '/location/' || old.slug;
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."locations_slug_redirects"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_email_verified"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email')
  ) then
    raise exception 'Email ownership not proven';
  end if;

  insert into public.email_verifications (user_id) values (auth.uid())
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."mark_email_verified"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."photographer_packages_enforce_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if (
    select count(*) from public.photographer_packages
    where photographer_id = new.photographer_id
      and package_type = new.package_type
      and id <> new.id
  ) >= 3 then
    raise exception 'You can create at most 3 % packages.', new.package_type;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."photographer_packages_enforce_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."photographer_phone_taken"("p_phone" "text", "p_exclude_user" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.photographer_profiles
    where right(regexp_replace(phone_number, '\D', '', 'g'), 10)
        = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
      and (p_exclude_user is null or user_id <> p_exclude_user)
  );
$$;


ALTER FUNCTION "public"."photographer_phone_taken"("p_phone" "text", "p_exclude_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."photographer_profiles_set_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."photographer_profiles_set_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_location_content_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if not public.has_permission('locations.edit')
     and (to_jsonb(new) - 'is_published' - 'updated_at') is distinct from
         (to_jsonb(old) - 'is_published' - 'updated_at') then
    raise exception 'You do not have permission to edit locations.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_location_content_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_location_publish_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if new.is_published is distinct from old.is_published
     and not public.has_permission('locations.publish') then
    raise exception 'You do not have permission to publish or unpublish locations.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_location_publish_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_photographer_status_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_new jsonb;
  v_old jsonb;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified then
    raise exception 'The verified badge can only be modified by an admin.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Non-admins may only activate (publish holders); never hold or suspend.
  if (new.is_active is distinct from old.is_active
      or new.suspended_at is distinct from old.suspended_at)
     and not (public.has_permission('photographers.publish')
              and new.is_active and new.suspended_at is null) then
    raise exception 'is_active and suspended_at can only be modified by an admin (employees may activate).'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.seo_title is distinct from old.seo_title
      or new.seo_description is distinct from old.seo_description)
     and not public.has_permission('photographers.edit') then
    raise exception 'SEO fields can only be modified by an admin or an editor.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Publish-only employees may not change anything else on someone's profile.
  -- Claim approval (a SECURITY DEFINER function) flags itself to assign user_id.
  if auth.uid() is not null
     and old.user_id is distinct from auth.uid()
     and not public.has_permission('photographers.edit') then
    v_new := to_jsonb(new) - 'is_active' - 'suspended_at' - 'updated_at';
    v_old := to_jsonb(old) - 'is_active' - 'suspended_at' - 'updated_at';
    if coalesce(current_setting('app.photographer_claim_approval', true), '') = 'on' then
      v_new := v_new - 'user_id';
      v_old := v_old - 'user_id';
    end if;
    if v_new is distinct from v_old then
      raise exception 'You do not have permission to edit photographer profiles.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_photographer_status_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_studio_content_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if not public.has_permission('studios.edit')
     and (to_jsonb(new) - 'is_published' - 'updated_at') is distinct from
         (to_jsonb(old) - 'is_published' - 'updated_at') then
    raise exception 'You do not have permission to edit studios.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_studio_content_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_studio_publish_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_trusted_db_context() then
    return new;
  end if;
  if new.is_published is distinct from old.is_published
     and not public.has_permission('studios.publish') then
    raise exception 'You do not have permission to publish or unpublish studios.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_studio_publish_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_site_banner_images"("image_urls" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.site_banner_images where true;

  if array_length(image_urls, 1) > 0 then
    insert into public.site_banner_images (image_url, sort_order)
    select url, (ord - 1)::int
    from unnest(image_urls) with ordinality as t(url, ord);
  end if;
end;
$$;


ALTER FUNCTION "public"."replace_site_banner_images"("image_urls" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_location_slug"("p_slug" "text") RETURNS TABLE("redirect_to" "text", "slug_exists" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select r.redirect_to from public.location_slug_redirects r where r.old_slug = p_slug limit 1),
    exists (select 1 from public.locations l where l.slug = p_slug and l.is_published);
$$;


ALTER FUNCTION "public"."resolve_location_slug"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_studio_slug"("p_slug" "text") RETURNS TABLE("redirect_to" "text", "slug_exists" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select r.redirect_to from public.studio_slug_redirects r where r.old_slug = p_slug limit 1),
    exists (select 1 from public.studios s where s.slug = p_slug and s.is_published);
$$;


ALTER FUNCTION "public"."resolve_studio_slug"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_photographer_location_collection"("p_collection_id" "uuid", "p_name" "text", "p_share_token" "text", "p_location_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_requested integer := coalesce(cardinality(p_location_ids), 0);
begin
  if auth.uid() is null or not public.is_photographer() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  if (select count(distinct x) from unnest(p_location_ids) as x) <> v_requested then
    raise exception 'duplicate_location' using errcode = 'unique_violation';
  end if;

  if (
    select count(*) from public.locations
    where id = any (p_location_ids) and is_published = true
  ) <> v_requested then
    raise exception 'location_not_published' using errcode = 'check_violation';
  end if;

  if p_collection_id is null then
    insert into public.photographer_location_collections (photographer_id, name, share_token)
    values (auth.uid(), p_name, p_share_token)
    returning id into v_id;
  else
    update public.photographer_location_collections
    set name = p_name
    where id = p_collection_id and photographer_id = auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'collection_not_found' using errcode = 'no_data_found';
    end if;

    delete from public.photographer_location_collection_locations where collection_id = v_id;
  end if;

  insert into public.photographer_location_collection_locations (collection_id, location_id, sort_order)
  select v_id, ids.location_id, ids.ord::integer
  from unnest(p_location_ids) with ordinality as ids (location_id, ord);

  return v_id;
end;
$$;


ALTER FUNCTION "public"."save_photographer_location_collection"("p_collection_id" "uuid", "p_name" "text", "p_share_token" "text", "p_location_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_claimable_photographers"("p_query" "text") RETURNS TABLE("id" "uuid", "studio_name" "text", "city" "text", "state_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id, p.studio_name, p.city, s.name
  from public.photographer_profiles p
  join public.states s on s.id = p.state_id
  where char_length(trim(coalesce(p_query, ''))) >= 3
    and p.user_id is null
    and p.suspended_at is null
    and (
      p.studio_name ilike '%' || trim(p_query) || '%'
      or p.display_name ilike '%' || trim(p_query) || '%'
    )
  order by p.studio_name
  limit 8;
$$;


ALTER FUNCTION "public"."search_claimable_photographers"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shared_location_collection_has_location"("p_token" "text", "p_slug" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.photographer_location_collections c
    join public.photographer_profiles p on p.user_id = c.photographer_id
    join public.photographer_location_collection_locations cl on cl.collection_id = c.id
    join public.locations l on l.id = cl.location_id
    where c.share_token = p_token
      and p.is_active = true
      and l.slug = p_slug
      and l.is_published = true
  );
$$;


ALTER FUNCTION "public"."shared_location_collection_has_location"("p_token" "text", "p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify_text"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'));
$$;


ALTER FUNCTION "public"."slugify_text"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."studios_slug_redirects"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  dest text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    delete from public.studio_slug_redirects where old_slug = new.slug;
  end if;

  if tg_op = 'UPDATE' and old.is_published and new.slug is distinct from old.slug then
    dest := '/studio/' || new.slug;

    insert into public.studio_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    update public.studio_slug_redirects
    set redirect_to = dest
    where redirect_to = '/studio/' || old.slug;
  end if;

  if tg_op = 'DELETE' and old.is_published then
    select '/studios/' || c.slug || '/' || s.slug || '/' || ci.slug
    into dest
    from public.countries c
    join public.states s on s.id = old.state_id
    join public.cities ci on ci.id = old.city_id
    where c.id = old.country_id;

    insert into public.studio_slug_redirects (old_slug, redirect_to)
    values (old.slug, dest)
    on conflict (old_slug) do update set redirect_to = excluded.redirect_to, created_at = now();

    update public.studio_slug_redirects
    set redirect_to = dest
    where redirect_to = '/studio/' || old.slug;
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."studios_slug_redirects"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_photographer_claim"("p_profile_id" "uuid", "p_full_name" "text", "p_studio_name" "text", "p_phone_number" "text", "p_proof_url" "text", "p_message" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Account has no email';
  end if;

  if exists (select 1 from public.photographer_profiles where user_id = auth.uid()) then
    raise exception 'This email already has a photographer account.';
  end if;

  if not exists (
    select 1 from public.photographer_profiles
    where id = p_profile_id and user_id is null and suspended_at is null
  ) then
    raise exception 'This profile is not available to claim.';
  end if;

  if (select count(*) from public.photographer_claim_requests
      where user_id = auth.uid() and status = 'pending') >= 3 then
    raise exception 'You already have pending claim requests.';
  end if;

  insert into public.photographer_claim_requests
    (profile_id, user_id, full_name, studio_name, email, phone_number, proof_url, message)
  values
    (p_profile_id, auth.uid(), trim(p_full_name), trim(p_studio_name), v_email,
     trim(p_phone_number), trim(p_proof_url), trim(p_message))
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."submit_photographer_claim"("p_profile_id" "uuid", "p_full_name" "text", "p_studio_name" "text", "p_phone_number" "text", "p_proof_url" "text", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_location_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.locations
  set updated_at = now()
  where id = coalesce(new.location_id, old.location_id);
  return null;
end;
$$;


ALTER FUNCTION "public"."touch_location_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb",
    CONSTRAINT "activity_events_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'published'::"text", 'unpublished'::"text", 'images_updated'::"text", 'faqs_updated'::"text", 'pricing_updated'::"text"]))),
    CONSTRAINT "activity_events_module_check" CHECK (("module" = ANY (ARRAY['locations'::"text", 'studios'::"text", 'photographers'::"text"])))
);


ALTER TABLE "public"."activity_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."activity_added_events" AS
 SELECT DISTINCT ON ("module", "entity_id") "id",
    "user_id",
    "module",
    'created'::"text" AS "action",
    "entity_id",
    "created_at",
    "metadata"
   FROM "public"."activity_events"
  WHERE ("action" = ANY (ARRAY['created'::"text", 'published'::"text"]))
  ORDER BY "module", "entity_id", ("action" <> 'published'::"text"), "created_at";


ALTER VIEW "public"."activity_added_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_page_seen" (
    "user_id" "uuid" NOT NULL,
    "page_key" "text" NOT NULL,
    "seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_page_seen_page_key_check" CHECK (("page_key" = ANY (ARRAY['users'::"text", 'photographer_profiles'::"text"])))
);


ALTER TABLE "public"."admin_page_seen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_rate_limits" (
    "id" bigint NOT NULL,
    "key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."auth_rate_limits" OWNER TO "postgres";


ALTER TABLE "public"."auth_rate_limits" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."auth_rate_limits_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."blog_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."blog_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."blog_faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_post_locations" (
    "post_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL
);


ALTER TABLE "public"."blog_post_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_post_tags" (
    "post_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."blog_post_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "excerpt" "text",
    "content" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "content_version" integer DEFAULT 1 NOT NULL,
    "category_id" "uuid",
    "author_name" "text" NOT NULL,
    "author_id" "uuid",
    "featured_image_url" "text",
    "featured_image_alt" "text",
    "meta_title" "text",
    "meta_description" "text",
    "is_featured" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "editor_id" "uuid",
    CONSTRAINT "blog_posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."blog_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."blog_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "h1_title" "text",
    "meta_title" "text",
    "meta_description" "text"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "image_url" "text",
    "h1_title" "text",
    "meta_title" "text",
    "meta_description" "text",
    "quick_facts" "jsonb"
);


ALTER TABLE "public"."cities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."countries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "h1_title" "text",
    "meta_title" "text",
    "meta_description" "text"
);


ALTER TABLE "public"."countries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."editors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role_title" "text",
    "image_url" "text",
    "bio" "text",
    "instagram_url" "text",
    "youtube_url" "text",
    "x_url" "text",
    "linkedin_url" "text",
    "facebook_url" "text",
    "website_url" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."editors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_verifications" (
    "user_id" "uuid" NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    CONSTRAINT "employee_permissions_code_check" CHECK (("code" ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'::"text"))
);


ALTER TABLE "public"."employee_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."employee_role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_roles_name_check" CHECK ((("name" = "btrim"("name")) AND (("char_length"("name") >= 1) AND ("char_length"("name") <= 80)))),
    CONSTRAINT "employee_roles_slug_check" CHECK (("slug" ~ '^[a-z0-9_]+$'::"text"))
);


ALTER TABLE "public"."employee_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "full_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favourites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favourites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_category_seo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "city_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "meta_title" "text",
    "meta_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_category_seo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rating" smallint DEFAULT 5 NOT NULL,
    CONSTRAINT "location_comments_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "location_comments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."location_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_editorial" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "content" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "city_id" "uuid",
    "city_slug" "text",
    CONSTRAINT "location_editorial_scope_check" CHECK (("scope" = ANY (ARRAY['state'::"text", 'state_category'::"text", 'city'::"text", 'city_category'::"text", 'photographer_state'::"text", 'photographer_city'::"text"]))),
    CONSTRAINT "location_editorial_scope_target_check" CHECK (((("scope" = ANY (ARRAY['state'::"text", 'photographer_state'::"text"])) AND ("category_id" IS NULL) AND ("city_id" IS NULL) AND ("city_slug" IS NULL)) OR (("scope" = 'state_category'::"text") AND ("category_id" IS NOT NULL) AND ("city_id" IS NULL) AND ("city_slug" IS NULL)) OR (("scope" = 'city'::"text") AND ("category_id" IS NULL) AND ("city_id" IS NOT NULL) AND ("city_slug" IS NULL)) OR (("scope" = 'city_category'::"text") AND ("category_id" IS NOT NULL) AND ("city_id" IS NOT NULL) AND ("city_slug" IS NULL)) OR (("scope" = 'photographer_city'::"text") AND ("category_id" IS NULL) AND ("city_id" IS NULL) AND ("city_slug" IS NOT NULL)))),
    CONSTRAINT "location_editorial_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."location_editorial" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "alt_text" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_images" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."location_primary_images" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("location_id") "location_id",
    "image_url",
    "sort_order"
   FROM "public"."location_images"
  ORDER BY "location_id", "sort_order", "created_at", "id";


ALTER VIEW "public"."location_primary_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "reporter_user_id" "uuid",
    "report_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "location_reports_message_check" CHECK ((("char_length"("message") >= 1) AND ("char_length"("message") <= 1000))),
    CONSTRAINT "location_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['incorrect_information'::"text", 'location_closed'::"text", 'wrong_location'::"text", 'inappropriate_content'::"text", 'duplicate'::"text", 'other'::"text"]))),
    CONSTRAINT "location_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."location_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_slug_redirects" (
    "old_slug" "text" NOT NULL,
    "redirect_to" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_slug_redirects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_state_category_seo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "meta_title" "text",
    "meta_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_state_category_seo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "category_id" "uuid",
    "pricing_type" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "price" numeric,
    "state_id" "uuid" NOT NULL,
    "city_id" "uuid" NOT NULL,
    "map_url" "text",
    "latitude" numeric,
    "longitude" numeric,
    "youtube_url" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drone_status" "text",
    "entry_fee" "text",
    "best_season" "text",
    "best_time" "text",
    "crowd" "text",
    "access" "text",
    "privacy" "text",
    "country_id" "uuid" NOT NULL,
    "price_note" "text",
    "action_type" "text",
    "action_value" "text",
    "pre_wedding_shoot" "text",
    "prior_booking" "text",
    "shoot_permit_fee" "text",
    "changing_rooms" "text",
    "parking_facility" "text",
    "facilities" "text",
    "meta_title" "text",
    "meta_description" "text",
    "card_name" "text",
    "recommended_outfits" "text",
    "vehicle_parking_fee" "text",
    "road_accessibility" "text",
    "boating_available" "text",
    "restrooms" "text",
    "weather_lighting" "text",
    "drone_permission" "text",
    "pre_wedding_shoot_condition" "text",
    CONSTRAINT "locations_action_type_check" CHECK (("action_type" = ANY (ARRAY['book_now'::"text", 'website'::"text", 'call_now'::"text"]))),
    CONSTRAINT "locations_changing_rooms_check" CHECK (("changing_rooms" = ANY (ARRAY['available'::"text", 'limited'::"text", 'not_available'::"text"]))),
    CONSTRAINT "locations_drone_status_check" CHECK (("drone_status" = ANY (ARRAY['allowed'::"text", 'allowed_with_permission'::"text", 'restricted'::"text", 'prohibited'::"text"]))),
    CONSTRAINT "locations_parking_facility_check" CHECK (("parking_facility" = ANY (ARRAY['available'::"text", 'limited'::"text", 'not_available'::"text"]))),
    CONSTRAINT "locations_pre_wedding_shoot_check" CHECK (("pre_wedding_shoot" = ANY (ARRAY['allowed'::"text", 'conditional'::"text", 'prohibited'::"text"]))),
    CONSTRAINT "locations_pricing_type_check" CHECK (("pricing_type" = ANY (ARRAY['free'::"text", 'paid'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_claim_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "studio_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "proof_url" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "photographer_claim_requests_email_check" CHECK (("char_length"("email") <= 320)),
    CONSTRAINT "photographer_claim_requests_full_name_check" CHECK ((("char_length"("full_name") >= 1) AND ("char_length"("full_name") <= 200))),
    CONSTRAINT "photographer_claim_requests_message_check" CHECK ((("char_length"("message") >= 1) AND ("char_length"("message") <= 1000))),
    CONSTRAINT "photographer_claim_requests_phone_number_check" CHECK (("char_length"("phone_number") <= 20)),
    CONSTRAINT "photographer_claim_requests_proof_url_check" CHECK ((("char_length"("proof_url") <= 500) AND ("proof_url" ~~ 'https://%'::"text"))),
    CONSTRAINT "photographer_claim_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "photographer_claim_requests_studio_name_check" CHECK ((("char_length"("studio_name") >= 1) AND ("char_length"("studio_name") <= 200)))
);


ALTER TABLE "public"."photographer_claim_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_geo_seo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "city_slug" "text",
    "image_url" "text",
    "h1_title" "text",
    "meta_title" "text",
    "meta_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."photographer_geo_seo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_location_collection_locations" (
    "collection_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "sort_order" integer NOT NULL
);


ALTER TABLE "public"."photographer_location_collection_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_location_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "share_token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "photographer_location_collections_name_check" CHECK (((("char_length"("name") >= 1) AND ("char_length"("name") <= 100)) AND ("name" = "btrim"("name")))),
    CONSTRAINT "photographer_location_collections_share_token_check" CHECK (("share_token" ~ '^[A-Za-z0-9_-]{43}$'::"text"))
);


ALTER TABLE "public"."photographer_location_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "package_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "actual_price" integer NOT NULL,
    "offer_price" integer,
    "banner_image_url" "text",
    "services" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "edited_pictures_count" integer,
    "edited_videos_count" integer,
    "save_the_date_video_count" integer,
    "countdown_images_count" integer,
    "shoot_duration_unit" "text",
    "shoot_duration_value" "text",
    "travel_charges" "text",
    "stay_charges" "text",
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "photographer_packages_actual_price_check" CHECK ((("actual_price" >= 0) AND ("actual_price" <= 10000000))),
    CONSTRAINT "photographer_packages_countdown_images_count_check" CHECK ((("countdown_images_count" IS NULL) OR (("countdown_images_count" >= 0) AND ("countdown_images_count" <= 1000)))),
    CONSTRAINT "photographer_packages_duration_pair" CHECK ((("shoot_duration_unit" IS NULL) = ("shoot_duration_value" IS NULL))),
    CONSTRAINT "photographer_packages_edited_pictures_count_check" CHECK ((("edited_pictures_count" IS NULL) OR (("edited_pictures_count" >= 0) AND ("edited_pictures_count" <= 100000)))),
    CONSTRAINT "photographer_packages_edited_videos_count_check" CHECK ((("edited_videos_count" IS NULL) OR (("edited_videos_count" >= 2) AND ("edited_videos_count" <= 1000)))),
    CONSTRAINT "photographer_packages_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 80))),
    CONSTRAINT "photographer_packages_offer_lte_actual" CHECK ((("offer_price" IS NULL) OR ("offer_price" <= "actual_price"))),
    CONSTRAINT "photographer_packages_offer_price_check" CHECK ((("offer_price" IS NULL) OR (("offer_price" >= 0) AND ("offer_price" <= 10000000)))),
    CONSTRAINT "photographer_packages_package_type_check" CHECK (("package_type" = ANY (ARRAY['regular'::"text", 'destination'::"text"]))),
    CONSTRAINT "photographer_packages_save_the_date_video_count_check" CHECK ((("save_the_date_video_count" IS NULL) OR (("save_the_date_video_count" >= 0) AND ("save_the_date_video_count" <= 1000)))),
    CONSTRAINT "photographer_packages_services_check" CHECK (("cardinality"("services") <= 10)),
    CONSTRAINT "photographer_packages_shoot_duration_unit_check" CHECK ((("shoot_duration_unit" IS NULL) OR ("shoot_duration_unit" = ANY (ARRAY['days'::"text", 'hours'::"text"])))),
    CONSTRAINT "photographer_packages_shoot_duration_value_check" CHECK ((("shoot_duration_value" IS NULL) OR (("char_length"("shoot_duration_value") >= 1) AND ("char_length"("shoot_duration_value") <= 30)))),
    CONSTRAINT "photographer_packages_stay_charges_check" CHECK ((("stay_charges" IS NULL) OR ("stay_charges" = ANY (ARRAY['extra'::"text", 'included'::"text"])))),
    CONSTRAINT "photographer_packages_travel_charges_check" CHECK ((("travel_charges" IS NULL) OR ("travel_charges" = ANY (ARRAY['extra'::"text", 'included'::"text"]))))
);


ALTER TABLE "public"."photographer_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_photo_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "storage_key" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'photoblinks'::"text" NOT NULL,
    "image_url" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "phone_number" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "r2_deletion_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "photographer_photo_submissions_r2_deletion_status_check" CHECK (("r2_deletion_status" = ANY (ARRAY['pending'::"text", 'failed'::"text", 'deleted'::"text"]))),
    CONSTRAINT "photographer_photo_submissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."photographer_photo_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "display_name" "text" NOT NULL,
    "bio" "text",
    "phone_number" "text" NOT NULL,
    "whatsapp_number" "text" NOT NULL,
    "instagram_url" "text",
    "portfolio_url" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "suspended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "studio_name" "text" NOT NULL,
    "city" "text" NOT NULL,
    "country_id" "uuid" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "starting_price" integer,
    "experience_years" smallint,
    "services" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "languages" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "travels_to_other_cities" boolean DEFAULT false NOT NULL,
    "logo_url" "text",
    "banner_url" "text",
    "offers_pre_wedding" boolean DEFAULT true NOT NULL,
    "offers_wedding" boolean DEFAULT false NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "youtube_url" "text",
    "seo_title" "text",
    "seo_description" "text",
    "google_business_url" "text",
    "google_maps_url" "text",
    "seo_h1" "text",
    CONSTRAINT "photographer_profiles_experience_years_check" CHECK ((("experience_years" IS NULL) OR (("experience_years" >= 0) AND ("experience_years" <= 60)))),
    CONSTRAINT "photographer_profiles_languages_check" CHECK (("cardinality"("languages") <= 12)),
    CONSTRAINT "photographer_profiles_services_check" CHECK (("cardinality"("services") <= 12)),
    CONSTRAINT "photographer_profiles_starting_price_check" CHECK ((("starting_price" IS NULL) OR (("starting_price" >= 0) AND ("starting_price" <= 10000000))))
);


ALTER TABLE "public"."photographer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."share_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."share_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_banner_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_url" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."site_banner_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "hero_image_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "instagram_url" "text",
    "facebook_url" "text",
    "youtube_url" "text",
    "pinterest_url" "text",
    "linkedin_url" "text",
    "location_info_table_config" "jsonb",
    CONSTRAINT "site_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsored_photographer_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "location_id" "uuid",
    "page_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sponsored_photographer_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['impression'::"text", 'call_click'::"text", 'whatsapp_click'::"text"])))
);


ALTER TABLE "public"."sponsored_photographer_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsored_photographers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photography_name" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "phone_number" "text" NOT NULL,
    "whatsapp_number" "text" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "expiry_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sponsored_photographers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "country_id" "uuid" NOT NULL,
    "image_url" "text",
    "h1_title" "text",
    "meta_title" "text",
    "meta_description" "text"
);


ALTER TABLE "public"."states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studio_faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "studio_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."studio_faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studio_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "studio_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "alt_text" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."studio_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studio_pricing_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "studio_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "price" numeric NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."studio_pricing_options" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."studio_primary_images" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("studio_id") "studio_id",
    "image_url",
    "sort_order"
   FROM "public"."studio_images"
  ORDER BY "studio_id", "sort_order", "created_at", "id";


ALTER VIEW "public"."studio_primary_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studio_slug_redirects" (
    "old_slug" "text" NOT NULL,
    "redirect_to" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."studio_slug_redirects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "state_id" "uuid" NOT NULL,
    "city_id" "uuid" NOT NULL,
    "map_url" "text",
    "latitude" numeric,
    "longitude" numeric,
    "youtube_url" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drone_status" "text",
    "entry_fee" "text",
    "best_season" "text",
    "best_time" "text",
    "crowd" "text",
    "access" "text",
    "privacy" "text",
    "country_id" "uuid" NOT NULL,
    "action_type" "text",
    "action_value" "text",
    "pre_wedding_shoot" "text",
    "prior_booking" "text",
    "shoot_permit_fee" "text",
    "changing_rooms" "text",
    "parking_facility" "text",
    "facilities" "text",
    "meta_title" "text",
    "meta_description" "text",
    "card_name" "text",
    "recommended_outfits" "text",
    "vehicle_parking_fee" "text",
    "road_accessibility" "text",
    "boating_available" "text",
    "restrooms" "text",
    "weather_lighting" "text",
    "drone_permission" "text",
    "pre_wedding_shoot_condition" "text",
    CONSTRAINT "studios_action_type_check" CHECK (("action_type" = ANY (ARRAY['book_now'::"text", 'website'::"text", 'call_now'::"text"]))),
    CONSTRAINT "studios_changing_rooms_check" CHECK (("changing_rooms" = ANY (ARRAY['available'::"text", 'limited'::"text", 'not_available'::"text"]))),
    CONSTRAINT "studios_drone_status_check" CHECK (("drone_status" = ANY (ARRAY['allowed'::"text", 'allowed_with_permission'::"text", 'restricted'::"text", 'prohibited'::"text"]))),
    CONSTRAINT "studios_parking_facility_check" CHECK (("parking_facility" = ANY (ARRAY['available'::"text", 'limited'::"text", 'not_available'::"text"]))),
    CONSTRAINT "studios_pre_wedding_shoot_check" CHECK (("pre_wedding_shoot" = ANY (ARRAY['allowed'::"text", 'conditional'::"text", 'prohibited'::"text"])))
);


ALTER TABLE "public"."studios" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_page_seen"
    ADD CONSTRAINT "admin_page_seen_pkey" PRIMARY KEY ("user_id", "page_key");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."auth_rate_limits"
    ADD CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_categories"
    ADD CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_categories"
    ADD CONSTRAINT "blog_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."blog_faqs"
    ADD CONSTRAINT "blog_faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_post_locations"
    ADD CONSTRAINT "blog_post_locations_pkey" PRIMARY KEY ("post_id", "location_id");



ALTER TABLE ONLY "public"."blog_post_tags"
    ADD CONSTRAINT "blog_post_tags_pkey" PRIMARY KEY ("post_id", "tag_id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."blog_tags"
    ADD CONSTRAINT "blog_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_tags"
    ADD CONSTRAINT "blog_tags_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_state_id_slug_key" UNIQUE ("state_id", "slug");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."editors"
    ADD CONSTRAINT "editors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."editors"
    ADD CONSTRAINT "editors_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."email_verifications"
    ADD CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_role_permissions"
    ADD CONSTRAINT "employee_role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."employee_roles"
    ADD CONSTRAINT "employee_roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."employee_roles"
    ADD CONSTRAINT "employee_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_roles"
    ADD CONSTRAINT "employee_roles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."favourites"
    ADD CONSTRAINT "favourites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favourites"
    ADD CONSTRAINT "favourites_user_id_location_id_key" UNIQUE ("user_id", "location_id");



ALTER TABLE ONLY "public"."location_category_seo"
    ADD CONSTRAINT "location_category_seo_city_id_category_id_key" UNIQUE ("city_id", "category_id");



ALTER TABLE ONLY "public"."location_category_seo"
    ADD CONSTRAINT "location_category_seo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_comments"
    ADD CONSTRAINT "location_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_editorial"
    ADD CONSTRAINT "location_editorial_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_faqs"
    ADD CONSTRAINT "location_faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_images"
    ADD CONSTRAINT "location_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_reports"
    ADD CONSTRAINT "location_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_slug_redirects"
    ADD CONSTRAINT "location_slug_redirects_pkey" PRIMARY KEY ("old_slug");



ALTER TABLE ONLY "public"."location_state_category_seo"
    ADD CONSTRAINT "location_state_category_seo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_state_category_seo"
    ADD CONSTRAINT "location_state_category_seo_state_id_category_id_key" UNIQUE ("state_id", "category_id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."photographer_claim_requests"
    ADD CONSTRAINT "photographer_claim_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photographer_geo_seo"
    ADD CONSTRAINT "photographer_geo_seo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photographer_location_collection_locations"
    ADD CONSTRAINT "photographer_location_collection_locations_pkey" PRIMARY KEY ("collection_id", "location_id");



ALTER TABLE ONLY "public"."photographer_location_collections"
    ADD CONSTRAINT "photographer_location_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photographer_location_collections"
    ADD CONSTRAINT "photographer_location_collections_share_token_key" UNIQUE ("share_token");



ALTER TABLE ONLY "public"."photographer_packages"
    ADD CONSTRAINT "photographer_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photographer_photo_submissions"
    ADD CONSTRAINT "photographer_photo_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photographer_photo_submissions"
    ADD CONSTRAINT "photographer_photo_submissions_storage_key_key" UNIQUE ("storage_key");



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."share_collections"
    ADD CONSTRAINT "share_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."share_collections"
    ADD CONSTRAINT "share_collections_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."share_collections"
    ADD CONSTRAINT "share_collections_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."site_banner_images"
    ADD CONSTRAINT "site_banner_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsored_photographer_events"
    ADD CONSTRAINT "sponsored_photographer_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsored_photographers"
    ADD CONSTRAINT "sponsored_photographers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."states"
    ADD CONSTRAINT "states_country_id_slug_key" UNIQUE ("country_id", "slug");



ALTER TABLE ONLY "public"."states"
    ADD CONSTRAINT "states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_faqs"
    ADD CONSTRAINT "studio_faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_images"
    ADD CONSTRAINT "studio_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_pricing_options"
    ADD CONSTRAINT "studio_pricing_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_slug_redirects"
    ADD CONSTRAINT "studio_slug_redirects_pkey" PRIMARY KEY ("old_slug");



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_slug_key" UNIQUE ("slug");



CREATE INDEX "activity_events_entity_created_idx" ON "public"."activity_events" USING "btree" ("entity_id", "created_at" DESC);



CREATE INDEX "activity_events_module_created_idx" ON "public"."activity_events" USING "btree" ("module", "created_at" DESC);



CREATE INDEX "activity_events_user_created_idx" ON "public"."activity_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "auth_rate_limits_key_created_idx" ON "public"."auth_rate_limits" USING "btree" ("key", "created_at");



CREATE INDEX "blog_faqs_post_id_idx" ON "public"."blog_faqs" USING "btree" ("post_id", "sort_order");



CREATE INDEX "blog_post_locations_location_id_idx" ON "public"."blog_post_locations" USING "btree" ("location_id");



CREATE INDEX "blog_post_tags_tag_id_idx" ON "public"."blog_post_tags" USING "btree" ("tag_id");



CREATE INDEX "blog_posts_category_id_idx" ON "public"."blog_posts" USING "btree" ("category_id");



CREATE INDEX "blog_posts_featured_published_idx" ON "public"."blog_posts" USING "btree" ("published_at" DESC) WHERE (("status" = 'published'::"text") AND ("is_featured" = true));



CREATE INDEX "blog_posts_status_published_at_idx" ON "public"."blog_posts" USING "btree" ("status", "published_at" DESC);



CREATE INDEX "cities_state_id_idx" ON "public"."cities" USING "btree" ("state_id");



CREATE UNIQUE INDEX "editors_single_default_uq" ON "public"."editors" USING "btree" ("is_default") WHERE "is_default";



CREATE INDEX "employees_is_active_idx" ON "public"."employees" USING "btree" ("is_active");



CREATE INDEX "employees_role_id_idx" ON "public"."employees" USING "btree" ("role_id");



CREATE INDEX "favourites_location_id_idx" ON "public"."favourites" USING "btree" ("location_id");



CREATE INDEX "favourites_user_id_idx" ON "public"."favourites" USING "btree" ("user_id");



CREATE INDEX "location_comments_location_id_idx" ON "public"."location_comments" USING "btree" ("location_id");



CREATE INDEX "location_comments_location_status_idx" ON "public"."location_comments" USING "btree" ("location_id", "status");



CREATE INDEX "location_comments_status_idx" ON "public"."location_comments" USING "btree" ("status");



CREATE INDEX "location_comments_user_id_idx" ON "public"."location_comments" USING "btree" ("user_id");



CREATE UNIQUE INDEX "location_editorial_city_category_uq" ON "public"."location_editorial" USING "btree" ("city_id", "category_id") WHERE ("scope" = 'city_category'::"text");



CREATE UNIQUE INDEX "location_editorial_city_uq" ON "public"."location_editorial" USING "btree" ("city_id") WHERE ("scope" = 'city'::"text");



CREATE UNIQUE INDEX "location_editorial_photographer_city_uq" ON "public"."location_editorial" USING "btree" ("state_id", "city_slug") WHERE ("scope" = 'photographer_city'::"text");



CREATE UNIQUE INDEX "location_editorial_photographer_state_uq" ON "public"."location_editorial" USING "btree" ("state_id") WHERE ("scope" = 'photographer_state'::"text");



CREATE UNIQUE INDEX "location_editorial_state_category_uq" ON "public"."location_editorial" USING "btree" ("state_id", "category_id") WHERE ("scope" = 'state_category'::"text");



CREATE INDEX "location_editorial_state_status_idx" ON "public"."location_editorial" USING "btree" ("state_id", "status");



CREATE UNIQUE INDEX "location_editorial_state_uq" ON "public"."location_editorial" USING "btree" ("state_id") WHERE ("scope" = 'state'::"text");



CREATE INDEX "location_faqs_location_id_idx" ON "public"."location_faqs" USING "btree" ("location_id", "sort_order");



CREATE INDEX "location_images_location_id_idx" ON "public"."location_images" USING "btree" ("location_id", "sort_order");



CREATE INDEX "location_reports_location_status_created_idx" ON "public"."location_reports" USING "btree" ("location_id", "status", "created_at");



CREATE INDEX "location_reports_reporter_created_idx" ON "public"."location_reports" USING "btree" ("reporter_user_id", "created_at") WHERE ("reporter_user_id" IS NOT NULL);



CREATE INDEX "location_reports_status_created_idx" ON "public"."location_reports" USING "btree" ("status", "created_at");



CREATE INDEX "location_slug_redirects_redirect_to_idx" ON "public"."location_slug_redirects" USING "btree" ("redirect_to");



CREATE INDEX "locations_category_id_idx" ON "public"."locations" USING "btree" ("category_id");



CREATE INDEX "locations_city_id_idx" ON "public"."locations" USING "btree" ("city_id");



CREATE INDEX "locations_country_id_idx" ON "public"."locations" USING "btree" ("country_id");



CREATE INDEX "locations_is_published_idx" ON "public"."locations" USING "btree" ("is_published");



CREATE INDEX "locations_state_id_idx" ON "public"."locations" USING "btree" ("state_id");



CREATE UNIQUE INDEX "photographer_claim_requests_pending_uq" ON "public"."photographer_claim_requests" USING "btree" ("profile_id", "user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "photographer_claim_requests_status_idx" ON "public"."photographer_claim_requests" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "photographer_geo_seo_city_uq" ON "public"."photographer_geo_seo" USING "btree" ("state_id", "city_slug") WHERE ("city_slug" IS NOT NULL);



CREATE UNIQUE INDEX "photographer_geo_seo_state_uq" ON "public"."photographer_geo_seo" USING "btree" ("state_id") WHERE ("city_slug" IS NULL);



CREATE INDEX "photographer_location_collection_locations_location_id_idx" ON "public"."photographer_location_collection_locations" USING "btree" ("location_id");



CREATE INDEX "photographer_location_collection_locations_order_idx" ON "public"."photographer_location_collection_locations" USING "btree" ("collection_id", "sort_order");



CREATE INDEX "photographer_location_collections_photographer_id_idx" ON "public"."photographer_location_collections" USING "btree" ("photographer_id");



CREATE INDEX "photographer_packages_photographer_idx" ON "public"."photographer_packages" USING "btree" ("photographer_id", "package_type", "created_at");



CREATE INDEX "photographer_profiles_country_id_idx" ON "public"."photographer_profiles" USING "btree" ("country_id");



CREATE UNIQUE INDEX "photographer_profiles_phone_uq" ON "public"."photographer_profiles" USING "btree" ("right"("regexp_replace"("phone_number", '\D'::"text", ''::"text", 'g'::"text"), 10));



CREATE UNIQUE INDEX "photographer_profiles_slug_uq" ON "public"."photographer_profiles" USING "btree" ("slug");



CREATE INDEX "photographer_profiles_state_id_idx" ON "public"."photographer_profiles" USING "btree" ("state_id");



CREATE INDEX "photographer_profiles_user_id_idx" ON "public"."photographer_profiles" USING "btree" ("user_id");



CREATE INDEX "pps_location_status_created_idx" ON "public"."photographer_photo_submissions" USING "btree" ("location_id", "status", "created_at" DESC);



CREATE INDEX "pps_photographer_created_idx" ON "public"."photographer_photo_submissions" USING "btree" ("photographer_id", "created_at" DESC);



CREATE INDEX "pps_status_created_idx" ON "public"."photographer_photo_submissions" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "site_banner_images_sort_order_idx" ON "public"."site_banner_images" USING "btree" ("sort_order");



CREATE INDEX "sponsored_photographer_events_created_at_idx" ON "public"."sponsored_photographer_events" USING "btree" ("created_at");



CREATE INDEX "sponsored_photographer_events_photographer_event_type_idx" ON "public"."sponsored_photographer_events" USING "btree" ("photographer_id", "event_type");



CREATE INDEX "sponsored_photographer_events_photographer_id_idx" ON "public"."sponsored_photographer_events" USING "btree" ("photographer_id");



CREATE INDEX "sponsored_photographer_events_photographer_location_idx" ON "public"."sponsored_photographer_events" USING "btree" ("photographer_id", "location_id");



CREATE INDEX "sponsored_photographers_state_id_idx" ON "public"."sponsored_photographers" USING "btree" ("state_id");



CREATE INDEX "studio_faqs_studio_id_idx" ON "public"."studio_faqs" USING "btree" ("studio_id", "sort_order");



CREATE INDEX "studio_images_studio_id_idx" ON "public"."studio_images" USING "btree" ("studio_id", "sort_order");



CREATE INDEX "studio_pricing_options_studio_id_idx" ON "public"."studio_pricing_options" USING "btree" ("studio_id", "sort_order");



CREATE INDEX "studio_slug_redirects_redirect_to_idx" ON "public"."studio_slug_redirects" USING "btree" ("redirect_to");



CREATE INDEX "studios_city_id_idx" ON "public"."studios" USING "btree" ("city_id");



CREATE INDEX "studios_country_id_idx" ON "public"."studios" USING "btree" ("country_id");



CREATE INDEX "studios_is_published_idx" ON "public"."studios" USING "btree" ("is_published");



CREATE INDEX "studios_state_id_idx" ON "public"."studios" USING "btree" ("state_id");



CREATE OR REPLACE TRIGGER "blog_categories_set_updated_at" BEFORE UPDATE ON "public"."blog_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "blog_faqs_set_updated_at" BEFORE UPDATE ON "public"."blog_faqs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "blog_posts_lock_published_slug" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."blog_posts_lock_published_slug"();



CREATE OR REPLACE TRIGGER "blog_posts_set_published_at" BEFORE INSERT OR UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."blog_posts_set_published_at"();



CREATE OR REPLACE TRIGGER "blog_posts_set_updated_at" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "blog_tags_set_updated_at" BEFORE UPDATE ON "public"."blog_tags" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "categories_set_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "editors_set_updated_at" BEFORE UPDATE ON "public"."editors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employees_set_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_category_seo_set_updated_at" BEFORE UPDATE ON "public"."location_category_seo" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_comments_set_updated_at" BEFORE UPDATE ON "public"."location_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_editorial_set_published_at" BEFORE INSERT OR UPDATE ON "public"."location_editorial" FOR EACH ROW EXECUTE FUNCTION "public"."location_editorial_set_published_at"();



CREATE OR REPLACE TRIGGER "location_editorial_set_updated_at" BEFORE UPDATE ON "public"."location_editorial" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_faqs_set_updated_at" BEFORE UPDATE ON "public"."location_faqs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_faqs_touch_location" AFTER INSERT OR DELETE OR UPDATE ON "public"."location_faqs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_location_updated_at"();



CREATE OR REPLACE TRIGGER "location_images_touch_location" AFTER INSERT OR DELETE OR UPDATE ON "public"."location_images" FOR EACH ROW EXECUTE FUNCTION "public"."touch_location_updated_at"();



CREATE OR REPLACE TRIGGER "location_reports_set_updated_at" BEFORE UPDATE ON "public"."location_reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_state_category_seo_set_updated_at" BEFORE UPDATE ON "public"."location_state_category_seo" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "locations_protect_content_fields" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."protect_location_content_fields"();



CREATE OR REPLACE TRIGGER "locations_protect_publish_status" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."protect_location_publish_status"();



CREATE OR REPLACE TRIGGER "locations_set_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "locations_slug_redirects" BEFORE INSERT OR DELETE OR UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."locations_slug_redirects"();



CREATE OR REPLACE TRIGGER "photographer_geo_seo_set_updated_at" BEFORE UPDATE ON "public"."photographer_geo_seo" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photographer_location_collection_locations_limit" BEFORE INSERT ON "public"."photographer_location_collection_locations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_location_collection_location_limit"();



CREATE OR REPLACE TRIGGER "photographer_location_collections_limit" BEFORE INSERT ON "public"."photographer_location_collections" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_photographer_location_collection_limit"();



CREATE OR REPLACE TRIGGER "photographer_location_collections_set_updated_at" BEFORE UPDATE ON "public"."photographer_location_collections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photographer_packages_enforce_limit" BEFORE INSERT OR UPDATE OF "package_type" ON "public"."photographer_packages" FOR EACH ROW EXECUTE FUNCTION "public"."photographer_packages_enforce_limit"();



CREATE OR REPLACE TRIGGER "photographer_packages_set_updated_at" BEFORE UPDATE ON "public"."photographer_packages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photographer_photo_submissions_set_updated_at" BEFORE UPDATE ON "public"."photographer_photo_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photographer_profiles_protect_status" BEFORE UPDATE ON "public"."photographer_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_photographer_status_fields"();



CREATE OR REPLACE TRIGGER "photographer_profiles_set_slug" BEFORE INSERT OR UPDATE ON "public"."photographer_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."photographer_profiles_set_slug"();



CREATE OR REPLACE TRIGGER "photographer_profiles_set_updated_at" BEFORE UPDATE ON "public"."photographer_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "site_settings_set_updated_at" BEFORE UPDATE ON "public"."site_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sponsored_photographers_set_updated_at" BEFORE UPDATE ON "public"."sponsored_photographers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sponsored_photographers_state_uniqueness" BEFORE INSERT OR UPDATE ON "public"."sponsored_photographers" FOR EACH ROW EXECUTE FUNCTION "public"."check_sponsored_photographer_state_uniqueness"();



CREATE OR REPLACE TRIGGER "studio_faqs_set_updated_at" BEFORE UPDATE ON "public"."studio_faqs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "studios_protect_content_fields" BEFORE UPDATE ON "public"."studios" FOR EACH ROW EXECUTE FUNCTION "public"."protect_studio_content_fields"();



CREATE OR REPLACE TRIGGER "studios_protect_publish_status" BEFORE UPDATE ON "public"."studios" FOR EACH ROW EXECUTE FUNCTION "public"."protect_studio_publish_status"();



CREATE OR REPLACE TRIGGER "studios_set_updated_at" BEFORE UPDATE ON "public"."studios" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "studios_slug_redirects" BEFORE INSERT OR DELETE OR UPDATE ON "public"."studios" FOR EACH ROW EXECUTE FUNCTION "public"."studios_slug_redirects"();



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_page_seen"
    ADD CONSTRAINT "admin_page_seen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_faqs"
    ADD CONSTRAINT "blog_faqs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_post_locations"
    ADD CONSTRAINT "blog_post_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_post_locations"
    ADD CONSTRAINT "blog_post_locations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_post_tags"
    ADD CONSTRAINT "blog_post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_post_tags"
    ADD CONSTRAINT "blog_post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."blog_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "public"."editors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_verifications"
    ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_role_permissions"
    ADD CONSTRAINT "employee_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."employee_permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_role_permissions"
    ADD CONSTRAINT "employee_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."employee_roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."employee_roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favourites"
    ADD CONSTRAINT "favourites_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favourites"
    ADD CONSTRAINT "favourites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_category_seo"
    ADD CONSTRAINT "location_category_seo_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_category_seo"
    ADD CONSTRAINT "location_category_seo_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_comments"
    ADD CONSTRAINT "location_comments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_comments"
    ADD CONSTRAINT "location_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_editorial"
    ADD CONSTRAINT "location_editorial_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_editorial"
    ADD CONSTRAINT "location_editorial_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_editorial"
    ADD CONSTRAINT "location_editorial_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_faqs"
    ADD CONSTRAINT "location_faqs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_images"
    ADD CONSTRAINT "location_images_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_reports"
    ADD CONSTRAINT "location_reports_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."location_reports"
    ADD CONSTRAINT "location_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."location_reports"
    ADD CONSTRAINT "location_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."location_state_category_seo"
    ADD CONSTRAINT "location_state_category_seo_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_state_category_seo"
    ADD CONSTRAINT "location_state_category_seo_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."photographer_claim_requests"
    ADD CONSTRAINT "photographer_claim_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."photographer_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_claim_requests"
    ADD CONSTRAINT "photographer_claim_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_geo_seo"
    ADD CONSTRAINT "photographer_geo_seo_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_location_collection_locations"
    ADD CONSTRAINT "photographer_location_collection_locations_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."photographer_location_collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_location_collection_locations"
    ADD CONSTRAINT "photographer_location_collection_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_location_collections"
    ADD CONSTRAINT "photographer_location_collections_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_packages"
    ADD CONSTRAINT "photographer_packages_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_photo_submissions"
    ADD CONSTRAINT "photographer_photo_submissions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."photographer_photo_submissions"
    ADD CONSTRAINT "photographer_photo_submissions_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."photographer_photo_submissions"
    ADD CONSTRAINT "photographer_photo_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."share_collections"
    ADD CONSTRAINT "share_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sponsored_photographer_events"
    ADD CONSTRAINT "sponsored_photographer_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sponsored_photographer_events"
    ADD CONSTRAINT "sponsored_photographer_events_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."sponsored_photographers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sponsored_photographers"
    ADD CONSTRAINT "sponsored_photographers_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."states"
    ADD CONSTRAINT "states_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."studio_faqs"
    ADD CONSTRAINT "studio_faqs_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_images"
    ADD CONSTRAINT "studio_images_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_pricing_options"
    ADD CONSTRAINT "studio_pricing_options_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE RESTRICT;



ALTER TABLE "public"."activity_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_page_seen" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_page_seen_own" ON "public"."admin_page_seen" USING ((("user_id" = "auth"."uid"()) AND "public"."is_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_admin"()));



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_admin_read" ON "public"."admins" FOR SELECT USING ("public"."is_admin"());



ALTER TABLE "public"."auth_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blog_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_categories_admin_all" ON "public"."blog_categories" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "blog_categories_public_read" ON "public"."blog_categories" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."blog_faqs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_faqs_admin_all" ON "public"."blog_faqs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "blog_faqs_public_read" ON "public"."blog_faqs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."blog_posts" "p"
  WHERE (("p"."id" = "blog_faqs"."post_id") AND ("p"."status" = 'published'::"text")))));



ALTER TABLE "public"."blog_post_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_post_locations_admin_all" ON "public"."blog_post_locations" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "blog_post_locations_public_read" ON "public"."blog_post_locations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."blog_posts" "p"
  WHERE (("p"."id" = "blog_post_locations"."post_id") AND ("p"."status" = 'published'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."id" = "blog_post_locations"."location_id") AND ("l"."is_published" = true))))));



ALTER TABLE "public"."blog_post_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_post_tags_admin_all" ON "public"."blog_post_tags" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "blog_post_tags_public_read" ON "public"."blog_post_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."blog_posts" "p"
  WHERE (("p"."id" = "blog_post_tags"."post_id") AND ("p"."status" = 'published'::"text")))));



ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_posts_admin_all" ON "public"."blog_posts" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "blog_posts_public_read" ON "public"."blog_posts" FOR SELECT USING (("status" = 'published'::"text"));



ALTER TABLE "public"."blog_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_tags_admin_all" ON "public"."blog_tags" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "blog_tags_public_read" ON "public"."blog_tags" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_admin_all" ON "public"."categories" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "categories_public_read" ON "public"."categories" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."cities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cities_admin_all" ON "public"."cities" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "cities_employee_insert" ON "public"."cities" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission")));



CREATE POLICY "cities_employee_select" ON "public"."cities" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission")));



CREATE POLICY "cities_employee_update" ON "public"."cities" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"))) WITH CHECK ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission")));



CREATE POLICY "cities_public_read" ON "public"."cities" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."countries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "countries_admin_all" ON "public"."countries" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "countries_public_read" ON "public"."countries" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."editors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "editors_admin_all" ON "public"."editors" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "editors_public_read" ON "public"."editors" FOR SELECT USING (true);



ALTER TABLE "public"."email_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_verifications_admin_read" ON "public"."email_verifications" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "email_verifications_own_read" ON "public"."email_verifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."employee_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_permissions_admin_all" ON "public"."employee_permissions" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."employee_role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_role_permissions_admin_all" ON "public"."employee_role_permissions" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."employee_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_roles_admin_all" ON "public"."employee_roles" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_admin_all" ON "public"."employees" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."favourites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "favourites_delete_own" ON "public"."favourites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "favourites_insert_own" ON "public"."favourites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "favourites_select_own" ON "public"."favourites" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."location_category_seo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_category_seo_admin_all" ON "public"."location_category_seo" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "location_category_seo_public_read" ON "public"."location_category_seo" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."city_id" = "location_category_seo"."city_id") AND ("l"."category_id" = "location_category_seo"."category_id") AND ("l"."is_published" = true)))));



ALTER TABLE "public"."location_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_comments_admin_all" ON "public"."location_comments" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "location_comments_insert_own" ON "public"."location_comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."id" = "location_comments"."location_id") AND ("l"."is_published" = true))))));



CREATE POLICY "location_comments_public_read" ON "public"."location_comments" FOR SELECT USING (("status" = 'approved'::"text"));



ALTER TABLE "public"."location_editorial" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_editorial_admin_all" ON "public"."location_editorial" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "location_editorial_public_read" ON "public"."location_editorial" FOR SELECT USING (("status" = 'published'::"text"));



ALTER TABLE "public"."location_faqs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_faqs_admin_all" ON "public"."location_faqs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "location_faqs_employee_delete" ON "public"."location_faqs" FOR DELETE TO "authenticated" USING (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission"));



CREATE POLICY "location_faqs_employee_insert" ON "public"."location_faqs" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission"));



CREATE POLICY "location_faqs_employee_select" ON "public"."location_faqs" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('locations.publish'::"text") AS "has_permission")));



CREATE POLICY "location_faqs_employee_update" ON "public"."location_faqs" FOR UPDATE TO "authenticated" USING (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission"));



CREATE POLICY "location_faqs_public_read" ON "public"."location_faqs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."id" = "location_faqs"."location_id") AND ("l"."is_published" = true)))));



ALTER TABLE "public"."location_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_images_admin_all" ON "public"."location_images" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "location_images_employee_delete" ON "public"."location_images" FOR DELETE TO "authenticated" USING (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission"));



CREATE POLICY "location_images_employee_insert" ON "public"."location_images" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission"));



CREATE POLICY "location_images_employee_select" ON "public"."location_images" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('locations.publish'::"text") AS "has_permission")));



CREATE POLICY "location_images_employee_update" ON "public"."location_images" FOR UPDATE TO "authenticated" USING (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission"));



CREATE POLICY "location_images_public_read" ON "public"."location_images" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."id" = "location_images"."location_id") AND ("l"."is_published" = true)))));



ALTER TABLE "public"."location_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_reports_admin_all" ON "public"."location_reports" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."location_slug_redirects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_slug_redirects_admin_all" ON "public"."location_slug_redirects" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."location_state_category_seo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_state_category_seo_admin_all" ON "public"."location_state_category_seo" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "location_state_category_seo_public_read" ON "public"."location_state_category_seo" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."state_id" = "location_state_category_seo"."state_id") AND ("l"."category_id" = "location_state_category_seo"."category_id") AND ("l"."is_published" = true)))));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_admin_all" ON "public"."locations" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "locations_employee_insert" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission"));



CREATE POLICY "locations_employee_select" ON "public"."locations" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('locations.publish'::"text") AS "has_permission")));



CREATE POLICY "locations_employee_update" ON "public"."locations" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('locations.publish'::"text") AS "has_permission"))) WITH CHECK ((( SELECT "public"."has_permission"('locations.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('locations.publish'::"text") AS "has_permission")));



CREATE POLICY "locations_public_read" ON "public"."locations" FOR SELECT USING (("is_published" = true));



ALTER TABLE "public"."photographer_claim_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "photographer_claim_requests_admin_all" ON "public"."photographer_claim_requests" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "photographer_claim_requests_employee_select" ON "public"."photographer_claim_requests" FOR SELECT TO "authenticated" USING (( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission"));



CREATE POLICY "photographer_claim_requests_employee_update" ON "public"."photographer_claim_requests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission"));



CREATE POLICY "photographer_claim_requests_own_read" ON "public"."photographer_claim_requests" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."photographer_geo_seo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "photographer_geo_seo_admin_all" ON "public"."photographer_geo_seo" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "photographer_geo_seo_employee_write" ON "public"."photographer_geo_seo" TO "authenticated" USING (( SELECT "public"."has_permission"('photographers.edit'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('photographers.edit'::"text") AS "has_permission"));



CREATE POLICY "photographer_geo_seo_public_read" ON "public"."photographer_geo_seo" FOR SELECT USING (true);



ALTER TABLE "public"."photographer_location_collection_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "photographer_location_collection_locations_own_delete" ON "public"."photographer_location_collection_locations" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."photographer_location_collections" "c"
  WHERE (("c"."id" = "photographer_location_collection_locations"."collection_id") AND ("c"."photographer_id" = "auth"."uid"())))) AND "public"."is_photographer"()));



CREATE POLICY "photographer_location_collection_locations_own_insert" ON "public"."photographer_location_collection_locations" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."photographer_location_collections" "c"
  WHERE (("c"."id" = "photographer_location_collection_locations"."collection_id") AND ("c"."photographer_id" = "auth"."uid"())))) AND "public"."is_photographer"()));



CREATE POLICY "photographer_location_collection_locations_own_select" ON "public"."photographer_location_collection_locations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."photographer_location_collections" "c"
  WHERE (("c"."id" = "photographer_location_collection_locations"."collection_id") AND ("c"."photographer_id" = "auth"."uid"())))) AND "public"."is_photographer"()));



CREATE POLICY "photographer_location_collection_locations_own_update" ON "public"."photographer_location_collection_locations" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."photographer_location_collections" "c"
  WHERE (("c"."id" = "photographer_location_collection_locations"."collection_id") AND ("c"."photographer_id" = "auth"."uid"())))) AND "public"."is_photographer"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."photographer_location_collections" "c"
  WHERE (("c"."id" = "photographer_location_collection_locations"."collection_id") AND ("c"."photographer_id" = "auth"."uid"())))) AND "public"."is_photographer"()));



ALTER TABLE "public"."photographer_location_collections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "photographer_location_collections_own_delete" ON "public"."photographer_location_collections" FOR DELETE USING ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



CREATE POLICY "photographer_location_collections_own_insert" ON "public"."photographer_location_collections" FOR INSERT WITH CHECK ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



CREATE POLICY "photographer_location_collections_own_select" ON "public"."photographer_location_collections" FOR SELECT USING ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



CREATE POLICY "photographer_location_collections_own_update" ON "public"."photographer_location_collections" FOR UPDATE USING ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"())) WITH CHECK ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



ALTER TABLE "public"."photographer_packages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "photographer_packages_admin_all" ON "public"."photographer_packages" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "photographer_packages_own_delete" ON "public"."photographer_packages" FOR DELETE USING ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



CREATE POLICY "photographer_packages_own_insert" ON "public"."photographer_packages" FOR INSERT WITH CHECK ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



CREATE POLICY "photographer_packages_own_select" ON "public"."photographer_packages" FOR SELECT USING ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



CREATE POLICY "photographer_packages_own_update" ON "public"."photographer_packages" FOR UPDATE USING ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"())) WITH CHECK ((("photographer_id" = "auth"."uid"()) AND "public"."is_photographer"()));



ALTER TABLE "public"."photographer_photo_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photographer_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "photographer_profiles_admin_all" ON "public"."photographer_profiles" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "photographer_profiles_employee_insert" ON "public"."photographer_profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."has_permission"('photographers.edit'::"text") AS "has_permission") AND ("user_id" IS NULL) AND ("is_active" = false) AND ("suspended_at" IS NULL)));



CREATE POLICY "photographer_profiles_employee_select" ON "public"."photographer_profiles" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('photographers.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission")));



CREATE POLICY "photographer_profiles_employee_update" ON "public"."photographer_profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."has_permission"('photographers.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission"))) WITH CHECK ((( SELECT "public"."has_permission"('photographers.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission")));



CREATE POLICY "photographer_profiles_own_insert" ON "public"."photographer_profiles" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("is_active" = false) AND ("suspended_at" IS NULL)));



CREATE POLICY "photographer_profiles_own_read" ON "public"."photographer_profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "photographer_profiles_own_update" ON "public"."photographer_profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "pps_admin_all" ON "public"."photographer_photo_submissions" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "pps_employee_select" ON "public"."photographer_photo_submissions" FOR SELECT TO "authenticated" USING (( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission"));



CREATE POLICY "pps_employee_update" ON "public"."photographer_photo_submissions" FOR UPDATE TO "authenticated" USING (( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('photographers.publish'::"text") AS "has_permission"));



CREATE POLICY "pps_photographer_insert" ON "public"."photographer_photo_submissions" FOR INSERT WITH CHECK (("public"."is_photographer"() AND ("photographer_id" = "auth"."uid"()) AND ("status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."id" = "photographer_photo_submissions"."location_id") AND ("l"."is_published" = true))))));



CREATE POLICY "pps_photographer_select" ON "public"."photographer_photo_submissions" FOR SELECT USING (("photographer_id" = "auth"."uid"()));



ALTER TABLE "public"."share_collections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "share_collections_insert_own" ON "public"."share_collections" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "share_collections_select_own" ON "public"."share_collections" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "share_collections_update_own" ON "public"."share_collections" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."site_banner_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_banner_images_admin_all" ON "public"."site_banner_images" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "site_banner_images_public_read" ON "public"."site_banner_images" FOR SELECT USING (true);



ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_settings_admin_all" ON "public"."site_settings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sponsored_photographer_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sponsored_photographer_events_admin_all" ON "public"."sponsored_photographer_events" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sponsored_photographers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sponsored_photographers_admin_all" ON "public"."sponsored_photographers" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "sponsored_photographers_public_read" ON "public"."sponsored_photographers" FOR SELECT USING (("expiry_date" >= CURRENT_DATE));



ALTER TABLE "public"."states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "states_admin_all" ON "public"."states" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "states_public_read" ON "public"."states" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."studio_faqs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "studio_faqs_admin_all" ON "public"."studio_faqs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "studio_faqs_employee_delete" ON "public"."studio_faqs" FOR DELETE TO "authenticated" USING (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_faqs_employee_insert" ON "public"."studio_faqs" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_faqs_employee_select" ON "public"."studio_faqs" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.publish'::"text") AS "has_permission")));



CREATE POLICY "studio_faqs_employee_update" ON "public"."studio_faqs" FOR UPDATE TO "authenticated" USING (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_faqs_public_read" ON "public"."studio_faqs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."studios" "s"
  WHERE (("s"."id" = "studio_faqs"."studio_id") AND ("s"."is_published" = true)))));



ALTER TABLE "public"."studio_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "studio_images_admin_all" ON "public"."studio_images" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "studio_images_employee_delete" ON "public"."studio_images" FOR DELETE TO "authenticated" USING (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_images_employee_insert" ON "public"."studio_images" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_images_employee_select" ON "public"."studio_images" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.publish'::"text") AS "has_permission")));



CREATE POLICY "studio_images_employee_update" ON "public"."studio_images" FOR UPDATE TO "authenticated" USING (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_images_public_read" ON "public"."studio_images" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."studios" "s"
  WHERE (("s"."id" = "studio_images"."studio_id") AND ("s"."is_published" = true)))));



ALTER TABLE "public"."studio_pricing_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "studio_pricing_options_admin_all" ON "public"."studio_pricing_options" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "studio_pricing_options_employee_delete" ON "public"."studio_pricing_options" FOR DELETE TO "authenticated" USING (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_pricing_options_employee_insert" ON "public"."studio_pricing_options" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_pricing_options_employee_select" ON "public"."studio_pricing_options" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.publish'::"text") AS "has_permission")));



CREATE POLICY "studio_pricing_options_employee_update" ON "public"."studio_pricing_options" FOR UPDATE TO "authenticated" USING (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission")) WITH CHECK (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studio_pricing_options_public_read" ON "public"."studio_pricing_options" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."studios" "s"
  WHERE (("s"."id" = "studio_pricing_options"."studio_id") AND ("s"."is_published" = true)))));



ALTER TABLE "public"."studio_slug_redirects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "studio_slug_redirects_admin_all" ON "public"."studio_slug_redirects" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."studios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "studios_admin_all" ON "public"."studios" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "studios_employee_insert" ON "public"."studios" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission"));



CREATE POLICY "studios_employee_select" ON "public"."studios" FOR SELECT TO "authenticated" USING ((( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.publish'::"text") AS "has_permission")));



CREATE POLICY "studios_employee_update" ON "public"."studios" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.publish'::"text") AS "has_permission"))) WITH CHECK ((( SELECT "public"."has_permission"('studios.edit'::"text") AS "has_permission") OR ( SELECT "public"."has_permission"('studios.publish'::"text") AS "has_permission")));



CREATE POLICY "studios_public_read" ON "public"."studios" FOR SELECT USING (("is_published" = true));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."location_reports";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."photographer_photo_submissions";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




























































































































































REVOKE ALL ON FUNCTION "public"."activity_entity_is_published"("p_module" "text", "p_entity_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_find_user_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_find_user_by_email"("p_email" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."approve_photographer_claim"("p_claim_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_photographer_claim"("p_claim_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."find_or_create_city"("p_state_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_or_create_city"("p_state_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_or_create_city"("p_state_id" "uuid", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_activity_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_activity_summary"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_city_pages_inventory"("p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_city_pages_inventory_count"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_country_pages_inventory"("p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_country_pages_inventory_count"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_employees"("p_active" boolean, "p_search" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_employees"("p_active" boolean, "p_search" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_employees_count"("p_active" boolean, "p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_employees_count"("p_active" boolean, "p_search" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_location_comments"("p_status" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_location_comments_count"("p_status" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_location_reports"("p_status" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_location_reports_count"("p_status" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_photographer_submissions"("p_status" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_photographer_submissions_count"("p_status" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_seo_location_category_filter_options"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_seo_location_category_inventory"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_city_slug" "text", "p_category_slug" "text", "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_seo_location_category_inventory_count"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_city_slug" "text", "p_category_slug" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_seo_location_state_category_filter_options"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_seo_location_state_category_inventory"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_category_slug" "text", "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_seo_location_state_category_inventory_count"("p_q" "text", "p_country_slug" "text", "p_state_slug" "text", "p_category_slug" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_state_pages_inventory"("p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_admin_state_pages_inventory_count"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_approved_location_comments"("p_location_id" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_approved_location_comments"("p_location_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_approved_photographer_photos"("p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_approved_photographer_photos"("p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_employee_daily_activity"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_daily_activity"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_employee_performance_stats"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_performance_stats"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_employee_period_summary"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_period_summary"("p_employee_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_location_rating_summary"("p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_location_rating_summary"("p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_location_slug_redirect"("p_old_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_location_slug_redirect"("p_old_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_location_slug_redirect"("p_old_slug" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_permissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_permissions"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_photographers"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_photographers"("p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_shared_favourite_location_ids"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_shared_favourite_location_ids"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_shared_location_collection"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_shared_location_collection"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sponsored_photographer_page_stats"("p_photographer_id" "uuid", "p_since" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_studio_slug_redirect"("p_old_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_studio_slug_redirect"("p_old_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_studio_slug_redirect"("p_old_slug" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_unverified_user_ids"("p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unverified_user_ids"("p_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_email_verified"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_email_verified"("p_user" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_employee"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_employee"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_trusted_db_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_trusted_db_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_trusted_db_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trusted_db_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_email_verified"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_email_verified"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."photographer_phone_taken"("p_phone" "text", "p_exclude_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."photographer_phone_taken"("p_phone" "text", "p_exclude_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."photographer_phone_taken"("p_phone" "text", "p_exclude_user" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."replace_site_banner_images"("image_urls" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_location_slug"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_location_slug"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_location_slug"("p_slug" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_studio_slug"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_studio_slug"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_studio_slug"("p_slug" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_photographer_location_collection"("p_collection_id" "uuid", "p_name" "text", "p_share_token" "text", "p_location_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_photographer_location_collection"("p_collection_id" "uuid", "p_name" "text", "p_share_token" "text", "p_location_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."search_claimable_photographers"("p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_claimable_photographers"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_claimable_photographers"("p_query" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."shared_location_collection_has_location"("p_token" "text", "p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shared_location_collection_has_location"("p_token" "text", "p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_photographer_claim"("p_profile_id" "uuid", "p_full_name" "text", "p_studio_name" "text", "p_phone_number" "text", "p_proof_url" "text", "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_photographer_claim"("p_profile_id" "uuid", "p_full_name" "text", "p_studio_name" "text", "p_phone_number" "text", "p_proof_url" "text", "p_message" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."touch_location_updated_at"() FROM PUBLIC;


















GRANT ALL ON TABLE "public"."activity_events" TO "service_role";



GRANT ALL ON TABLE "public"."activity_added_events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_page_seen" TO "anon";
GRANT ALL ON TABLE "public"."admin_page_seen" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_page_seen" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."auth_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."auth_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_rate_limits" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."auth_rate_limits_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."auth_rate_limits_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."auth_rate_limits_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blog_categories" TO "anon";
GRANT ALL ON TABLE "public"."blog_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_categories" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blog_faqs" TO "anon";
GRANT ALL ON TABLE "public"."blog_faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_faqs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blog_post_locations" TO "anon";
GRANT ALL ON TABLE "public"."blog_post_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_post_locations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blog_post_tags" TO "anon";
GRANT ALL ON TABLE "public"."blog_post_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_post_tags" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blog_posts" TO "anon";
GRANT ALL ON TABLE "public"."blog_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_posts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blog_tags" TO "anon";
GRANT ALL ON TABLE "public"."blog_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_tags" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cities" TO "anon";
GRANT ALL ON TABLE "public"."cities" TO "authenticated";
GRANT ALL ON TABLE "public"."cities" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."countries" TO "anon";
GRANT ALL ON TABLE "public"."countries" TO "authenticated";
GRANT ALL ON TABLE "public"."countries" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."editors" TO "anon";
GRANT ALL ON TABLE "public"."editors" TO "authenticated";
GRANT ALL ON TABLE "public"."editors" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."email_verifications" TO "anon";
GRANT ALL ON TABLE "public"."email_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."email_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."employee_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."employee_role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."employee_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_roles" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."favourites" TO "anon";
GRANT ALL ON TABLE "public"."favourites" TO "authenticated";
GRANT ALL ON TABLE "public"."favourites" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_category_seo" TO "anon";
GRANT ALL ON TABLE "public"."location_category_seo" TO "authenticated";
GRANT ALL ON TABLE "public"."location_category_seo" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_comments" TO "anon";
GRANT ALL ON TABLE "public"."location_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."location_comments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_editorial" TO "anon";
GRANT ALL ON TABLE "public"."location_editorial" TO "authenticated";
GRANT ALL ON TABLE "public"."location_editorial" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_faqs" TO "anon";
GRANT ALL ON TABLE "public"."location_faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."location_faqs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_images" TO "anon";
GRANT ALL ON TABLE "public"."location_images" TO "authenticated";
GRANT ALL ON TABLE "public"."location_images" TO "service_role";



GRANT ALL ON TABLE "public"."location_primary_images" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_reports" TO "anon";
GRANT ALL ON TABLE "public"."location_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."location_reports" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_slug_redirects" TO "anon";
GRANT ALL ON TABLE "public"."location_slug_redirects" TO "authenticated";
GRANT ALL ON TABLE "public"."location_slug_redirects" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."location_state_category_seo" TO "anon";
GRANT ALL ON TABLE "public"."location_state_category_seo" TO "authenticated";
GRANT ALL ON TABLE "public"."location_state_category_seo" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."photographer_claim_requests" TO "anon";
GRANT ALL ON TABLE "public"."photographer_claim_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_claim_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."photographer_geo_seo" TO "anon";
GRANT ALL ON TABLE "public"."photographer_geo_seo" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_geo_seo" TO "service_role";



GRANT ALL ON TABLE "public"."photographer_location_collection_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_location_collection_locations" TO "service_role";



GRANT ALL ON TABLE "public"."photographer_location_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_location_collections" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."photographer_packages" TO "anon";
GRANT ALL ON TABLE "public"."photographer_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_packages" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."photographer_photo_submissions" TO "anon";
GRANT ALL ON TABLE "public"."photographer_photo_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_photo_submissions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."photographer_profiles" TO "anon";
GRANT ALL ON TABLE "public"."photographer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."share_collections" TO "anon";
GRANT ALL ON TABLE "public"."share_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."share_collections" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."site_banner_images" TO "anon";
GRANT ALL ON TABLE "public"."site_banner_images" TO "authenticated";
GRANT ALL ON TABLE "public"."site_banner_images" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sponsored_photographer_events" TO "anon";
GRANT ALL ON TABLE "public"."sponsored_photographer_events" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsored_photographer_events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sponsored_photographers" TO "anon";
GRANT ALL ON TABLE "public"."sponsored_photographers" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsored_photographers" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."states" TO "anon";
GRANT ALL ON TABLE "public"."states" TO "authenticated";
GRANT ALL ON TABLE "public"."states" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."studio_faqs" TO "anon";
GRANT ALL ON TABLE "public"."studio_faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_faqs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."studio_images" TO "anon";
GRANT ALL ON TABLE "public"."studio_images" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_images" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."studio_pricing_options" TO "anon";
GRANT ALL ON TABLE "public"."studio_pricing_options" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_pricing_options" TO "service_role";



GRANT ALL ON TABLE "public"."studio_primary_images" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."studio_slug_redirects" TO "anon";
GRANT ALL ON TABLE "public"."studio_slug_redirects" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_slug_redirects" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."studios" TO "anon";
GRANT ALL ON TABLE "public"."studios" TO "authenticated";
GRANT ALL ON TABLE "public"."studios" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































