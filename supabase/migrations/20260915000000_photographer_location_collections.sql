-- Photographer "Share Location": a photographer curates named, ordered lists
-- of published locations and shares each one through an unguessable link
-- (/c/[token]). Purely additive — no existing table is altered.
--
-- Ownership uses the existing photographer_profiles identity (user_id =
-- auth.uid()); no second photographer identity is introduced.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.photographer_location_collections (
  id              uuid        primary key default gen_random_uuid(),
  photographer_id uuid        not null references public.photographer_profiles (user_id) on delete cascade,
  name            text        not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  -- 32 random bytes, base64url-encoded, generated server-side (see
  -- src/app/photographer/(shell)/share-location/actions.ts). Never derived
  -- from an id, slug, or timestamp.
  share_token     text        not null unique check (share_token ~ '^[A-Za-z0-9_-]{43}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index photographer_location_collections_photographer_id_idx
  on public.photographer_location_collections (photographer_id);

create trigger photographer_location_collections_set_updated_at
  before update on public.photographer_location_collections
  for each row execute function public.set_updated_at();

create table public.photographer_location_collection_locations (
  collection_id uuid    not null references public.photographer_location_collections (id) on delete cascade,
  location_id   uuid    not null references public.locations (id) on delete cascade,
  sort_order    integer not null,
  primary key (collection_id, location_id)
);

create index photographer_location_collection_locations_location_id_idx
  on public.photographer_location_collection_locations (location_id);
create index photographer_location_collection_locations_order_idx
  on public.photographer_location_collection_locations (collection_id, sort_order);

-- ---------------------------------------------------------------------------
-- Max 25 locations per share — enforced in the database so a direct request
-- (calling the save RPC with oversized input, or inserting child rows
-- directly, which RLS permits for the owner) cannot bypass the app check.
-- Same advisory-lock pattern as the collections limit below.
-- ---------------------------------------------------------------------------

create function public.enforce_location_collection_location_limit()
returns trigger
language plpgsql
set search_path = public
as $$
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

create trigger photographer_location_collection_locations_limit
  before insert on public.photographer_location_collection_locations
  for each row execute function public.enforce_location_collection_location_limit();

-- ---------------------------------------------------------------------------
-- Max 10 collections per photographer — enforced in the database so
-- concurrent creates can't race past a count check done in the app. The
-- advisory lock serializes inserts per photographer for this transaction.
-- ---------------------------------------------------------------------------

create function public.enforce_photographer_location_collection_limit()
returns trigger
language plpgsql
set search_path = public
as $$
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

create trigger photographer_location_collections_limit
  before insert on public.photographer_location_collections
  for each row execute function public.enforce_photographer_location_collection_limit();

-- ---------------------------------------------------------------------------
-- RLS — owner-only. No anon/public policy: RLS filters rows but cannot
-- require a caller to already know a token, so a public select policy would
-- let anyone enumerate every share token. Public access goes exclusively
-- through the SECURITY DEFINER functions further below.
-- ---------------------------------------------------------------------------

alter table public.photographer_location_collections enable row level security;
alter table public.photographer_location_collection_locations enable row level security;

create policy photographer_location_collections_own_select on public.photographer_location_collections
  for select using (photographer_id = auth.uid() and public.is_photographer());
create policy photographer_location_collections_own_insert on public.photographer_location_collections
  for insert with check (photographer_id = auth.uid() and public.is_photographer());
create policy photographer_location_collections_own_update on public.photographer_location_collections
  for update
  using (photographer_id = auth.uid() and public.is_photographer())
  with check (photographer_id = auth.uid() and public.is_photographer());
create policy photographer_location_collections_own_delete on public.photographer_location_collections
  for delete using (photographer_id = auth.uid() and public.is_photographer());

-- Child rows are owned through their parent collection.
create policy photographer_location_collection_locations_own_select on public.photographer_location_collection_locations
  for select using (
    exists (
      select 1 from public.photographer_location_collections c
      where c.id = collection_id and c.photographer_id = auth.uid()
    ) and public.is_photographer()
  );
create policy photographer_location_collection_locations_own_insert on public.photographer_location_collection_locations
  for insert with check (
    exists (
      select 1 from public.photographer_location_collections c
      where c.id = collection_id and c.photographer_id = auth.uid()
    ) and public.is_photographer()
  );
create policy photographer_location_collection_locations_own_update on public.photographer_location_collection_locations
  for update
  using (
    exists (
      select 1 from public.photographer_location_collections c
      where c.id = collection_id and c.photographer_id = auth.uid()
    ) and public.is_photographer()
  )
  with check (
    exists (
      select 1 from public.photographer_location_collections c
      where c.id = collection_id and c.photographer_id = auth.uid()
    ) and public.is_photographer()
  );
create policy photographer_location_collection_locations_own_delete on public.photographer_location_collection_locations
  for delete using (
    exists (
      select 1 from public.photographer_location_collections c
      where c.id = collection_id and c.photographer_id = auth.uid()
    ) and public.is_photographer()
  );

-- Private tables: anon never needs table-level access (the default grants in
-- 20260825010000_grants.sql give anon SELECT on every public table).
revoke all on public.photographer_location_collections from anon;
revoke all on public.photographer_location_collection_locations from anon;

-- ---------------------------------------------------------------------------
-- Save (create or edit) atomically. SECURITY INVOKER (the default): every
-- statement runs as the caller, so the RLS policies above remain the
-- ownership boundary. Collection + ordered locations are written in one
-- transaction so a failure never leaves a half-saved list.
--
-- p_collection_id null  → create with p_share_token.
-- p_collection_id given → rename + replace locations; share_token untouched
--                         (p_share_token is ignored), so the link stays valid.
-- ---------------------------------------------------------------------------

create function public.save_photographer_location_collection(
  p_collection_id uuid,
  p_name          text,
  p_share_token   text,
  p_location_ids  uuid[]
)
returns uuid
language plpgsql
set search_path = public
as $$
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

revoke execute on function public.save_photographer_location_collection(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.save_photographer_location_collection(uuid, text, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Public read paths (SECURITY DEFINER). Both require an exact token match on
-- an ACTIVE photographer's collection and only ever consider published
-- locations. Neither returns photographer_id, user/account ids, email, or
-- any other private field.
-- ---------------------------------------------------------------------------

-- Header (photographer's public contact card + list name) plus the ordered
-- ids of the collection's currently-published locations, in one call.
create function public.get_shared_location_collection(p_token text)
returns table (
  name            text,
  display_name    text,
  studio_name     text,
  bio             text,
  avatar_url      text,
  phone_number    text,
  whatsapp_number text,
  location_ids    uuid[]
)
language sql
security definer
stable
set search_path = public
as $$
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

-- Membership check for /c/[token]/location/[slug]: true only when the token
-- is active AND the published location with exactly this slug is in it.
create function public.shared_location_collection_has_location(p_token text, p_slug text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
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

revoke execute on function public.get_shared_location_collection(text) from public;
revoke execute on function public.shared_location_collection_has_location(text, text) from public;
grant execute on function public.get_shared_location_collection(text) to anon, authenticated;
grant execute on function public.shared_location_collection_has_location(text, text) to anon, authenticated;
