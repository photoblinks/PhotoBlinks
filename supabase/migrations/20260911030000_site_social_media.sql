-- Admin → Settings → Social Media: social profile links shown in the footer.
--
-- Extends the existing single-row site_settings admin-config table so it
-- reuses the seeded row, the set_updated_at trigger, and both existing RLS
-- policies (site_settings_public_read / site_settings_admin_all) exactly as
-- they are — no new table, no new policies, no renamed or removed columns.
--
-- A NULL/empty value means the platform is not configured and must not
-- appear in the public footer. Only the five allowlisted platforms below
-- exist; the platform set is also closed at the application layer (Zod
-- schema in the Settings server action, fixed SocialPlatform union in
-- src/lib/public-data.ts, hardcoded icon map in the footer).

alter table public.site_settings
  add column instagram_url text,
  add column facebook_url text,
  add column youtube_url text,
  add column pinterest_url text,
  add column linkedin_url text;