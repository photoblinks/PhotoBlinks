-- Phase 19A: minimal analytics for the sponsored photographer system
-- (Phase 17B) — impression/call/WhatsApp click counts per photographer,
-- broken down by the PhotoBlinks page they occurred on. No visitor
-- identity, IP, cookies, or session data of any kind is stored — see the
-- table comment. Purely additive: does not touch sponsored_photographers,
-- locations, or any other existing table.

create table public.sponsored_photographer_events (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.sponsored_photographers (id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'call_click', 'whatsapp_click')),
  -- Nullable and ON DELETE SET NULL (not cascade): if the location is later
  -- deleted, the event itself (and the page-level breakdown, which groups
  -- by the page_path text column below, not this FK) still stands.
  location_id uuid references public.locations (id) on delete set null,
  page_path text not null,
  created_at timestamptz not null default now()
);

create index sponsored_photographer_events_photographer_id_idx
  on public.sponsored_photographer_events (photographer_id);
create index sponsored_photographer_events_created_at_idx
  on public.sponsored_photographer_events (created_at);
create index sponsored_photographer_events_photographer_event_type_idx
  on public.sponsored_photographer_events (photographer_id, event_type);
create index sponsored_photographer_events_photographer_location_idx
  on public.sponsored_photographer_events (photographer_id, location_id);

-- The default privileges set up in 20260825010000_grants.sql only grant
-- `anon` a bare SELECT — every anonymous (signed-out) visitor writes
-- through this table via the public tracking action, so it additionally
-- needs INSERT. RLS (below) is still the real gate on which rows that
-- INSERT privilege can actually write.
grant insert on public.sponsored_photographer_events to anon;

alter table public.sponsored_photographer_events enable row level security;

-- Admin-only read (and, via `for all`, write) — analytics are an internal
-- commercial-performance view, never exposed to public users. Same
-- is_admin() mechanism as every other admin-only table.
create policy sponsored_photographer_events_admin_all on public.sponsored_photographer_events
  for all using (public.is_admin()) with check (public.is_admin());

-- The one public write path: recording a real impression/click, called
-- from the tracking server action (never a raw open endpoint, and never
-- the service-role key). RLS alone can't require "came through our
-- action" — PostgREST is reachable directly with the anon key regardless
-- — so this WITH CHECK is the actual enforcement: it requires the
-- photographer_id/location_id to reference REAL existing rows, which
-- blocks fabricated/arbitrary ids. It does not (and per the product's own
-- explicit scope, isn't meant to) stop someone from replaying events
-- against a real, currently-displayed photographer/location — see the
-- Phase 19A report's documented limitation on this.
create policy sponsored_photographer_events_insert_public on public.sponsored_photographer_events
  for insert
  with check (
    exists (select 1 from public.sponsored_photographers sp where sp.id = photographer_id)
    and (location_id is null or exists (select 1 from public.locations l where l.id = location_id))
  );

-- Page-level breakdown for the admin analytics page — aggregated in SQL
-- (not fetched as raw rows and summed in JS) so it stays cheap even with a
-- large event volume. Plain invoker (not security definer): only ever
-- called by an already-admin session, which already has full access via
-- the admin_all policy above.
create function public.get_sponsored_photographer_page_stats(
  p_photographer_id uuid,
  p_since timestamptz default null
)
returns table (
  page_path text,
  location_id uuid,
  impressions bigint,
  call_clicks bigint,
  whatsapp_clicks bigint
)
language sql
stable
set search_path = public
as $$
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

grant execute on function public.get_sponsored_photographer_page_stats(uuid, timestamptz) to authenticated;
