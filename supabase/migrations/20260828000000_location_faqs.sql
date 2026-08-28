-- Admin-managed FAQ entries for individual location detail pages. Publicly
-- readable only when the parent location is published — same pattern as
-- location_images.

create table public.location_faqs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index location_faqs_location_id_idx on public.location_faqs (location_id, sort_order);

create trigger location_faqs_set_updated_at
  before update on public.location_faqs
  for each row execute function public.set_updated_at();

alter table public.location_faqs enable row level security;

create policy location_faqs_public_read on public.location_faqs
  for select using (
    exists (
      select 1 from public.locations l
      where l.id = location_faqs.location_id and l.is_published = true
    )
  );
create policy location_faqs_admin_all on public.location_faqs
  for all using (public.is_admin()) with check (public.is_admin());
