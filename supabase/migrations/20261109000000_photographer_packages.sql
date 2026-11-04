-- Photographer packages: up to 3 "regular" and 3 "destination" pre-wedding
-- packages per photographer, shown as cards on their public page.
--
-- * Owned by the photographer (photographer_id = auth.uid(), same convention
--   as photographer_photo_submissions). A photographer who is not suspended
--   (is_photographer()) manages their own rows; admins can manage any.
-- * Live immediately (is_visible); the photographer can hide or delete.
--   Public pages read through the service-role public client and additionally
--   require the photographer's profile to be publicly visible.
-- * Optional counts/durations are NULL when not offered, so the public card
--   simply omits them. Allowed service values are validated by the app.
-- * At most 3 packages per (photographer, type), enforced by a trigger.
--
-- Purely additive. Reversible via: drop table public.photographer_packages;
-- drop function public.photographer_packages_enforce_limit();

create table public.photographer_packages (
  id                        uuid primary key default gen_random_uuid(),
  photographer_id           uuid not null references public.photographer_profiles (user_id) on delete cascade,
  package_type              text not null check (package_type in ('regular', 'destination')),
  name                      text not null check (char_length(name) between 1 and 80),
  actual_price              integer not null check (actual_price between 0 and 10000000),
  offer_price               integer check (offer_price is null or offer_price between 0 and 10000000),
  banner_image_url          text,
  services                  text[] not null default '{}' check (cardinality(services) <= 10),
  edited_pictures_count     integer check (edited_pictures_count is null or edited_pictures_count between 0 and 100000),
  edited_videos_count       integer check (edited_videos_count is null or edited_videos_count between 2 and 1000),
  save_the_date_video_count integer check (save_the_date_video_count is null or save_the_date_video_count between 0 and 1000),
  countdown_images_count    integer check (countdown_images_count is null or countdown_images_count between 0 and 1000),
  shoot_duration_unit       text check (shoot_duration_unit is null or shoot_duration_unit in ('days', 'hours')),
  shoot_duration_value      text check (shoot_duration_value is null or char_length(shoot_duration_value) between 1 and 30),
  travel_charges            text check (travel_charges is null or travel_charges in ('extra', 'included')),
  stay_charges              text check (stay_charges is null or stay_charges in ('extra', 'included')),
  is_visible                boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint photographer_packages_offer_lte_actual check (offer_price is null or offer_price <= actual_price),
  constraint photographer_packages_duration_pair check ((shoot_duration_unit is null) = (shoot_duration_value is null))
);

create index photographer_packages_photographer_idx
  on public.photographer_packages (photographer_id, package_type, created_at);

create trigger photographer_packages_set_updated_at
  before update on public.photographer_packages
  for each row execute function public.set_updated_at();

create function public.photographer_packages_enforce_limit()
returns trigger
language plpgsql
set search_path = public
as $$
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

create trigger photographer_packages_enforce_limit
  before insert or update of package_type on public.photographer_packages
  for each row execute function public.photographer_packages_enforce_limit();

alter table public.photographer_packages enable row level security;

create policy photographer_packages_own_select on public.photographer_packages
  for select using (photographer_id = auth.uid() and public.is_photographer());

create policy photographer_packages_own_insert on public.photographer_packages
  for insert with check (photographer_id = auth.uid() and public.is_photographer());

create policy photographer_packages_own_update on public.photographer_packages
  for update using (photographer_id = auth.uid() and public.is_photographer())
  with check (photographer_id = auth.uid() and public.is_photographer());

create policy photographer_packages_own_delete on public.photographer_packages
  for delete using (photographer_id = auth.uid() and public.is_photographer());

create policy photographer_packages_admin_all on public.photographer_packages
  for all using (public.is_admin()) with check (public.is_admin());
