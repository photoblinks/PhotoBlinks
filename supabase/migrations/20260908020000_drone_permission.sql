-- Optional free-text note on where to obtain drone permission, shown in the
-- admin form only when Drone Status is "Allowed with Permission" or
-- "Restricted". Nullable — nothing here is required.

alter table public.locations add column drone_permission text;
alter table public.studios add column drone_permission text;
