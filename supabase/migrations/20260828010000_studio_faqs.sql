-- Admin-managed FAQ entries for individual studio detail pages. Publicly
-- readable only when the parent studio is published — same pattern as
-- studio_images / location_faqs.

create table public.studio_faqs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_faqs_studio_id_idx on public.studio_faqs (studio_id, sort_order);

create trigger studio_faqs_set_updated_at
  before update on public.studio_faqs
  for each row execute function public.set_updated_at();

alter table public.studio_faqs enable row level security;

create policy studio_faqs_public_read on public.studio_faqs
  for select using (
    exists (
      select 1 from public.studios s
      where s.id = studio_faqs.studio_id and s.is_published = true
    )
  );
create policy studio_faqs_admin_all on public.studio_faqs
  for all using (public.is_admin()) with check (public.is_admin());
