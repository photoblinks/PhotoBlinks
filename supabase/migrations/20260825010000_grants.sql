-- Explicit table-level grants for the standard Supabase roles. Supabase's
-- hosted platform applies these automatically at project creation, but a
-- fresh Postgres instance (e.g. the local CLI stack) does not — RLS alone
-- isn't enough, Postgres checks table-level privileges before policies.
-- Row-level access is still governed entirely by the RLS policies in
-- 20260825000000_init_schema.sql; these grants just make the tables
-- reachable at all.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
