-- Local-dev-only admin account, recreated automatically every time
-- `supabase db reset` runs (see [db.seed] in supabase/config.toml — this
-- file is only ever read by the local CLI, it has no path to production).
--
-- Fixed credentials so they're always the same after a reset:
--   email:    admin@photoblinks.local
--   password: localdev123
--
-- Mirrors what scripts/seed-admin.mjs does through the Auth Admin API,
-- but written directly against the local auth schema so it can run here
-- as plain SQL: an auth.users row with a bcrypt password hash (pgcrypto,
-- enabled in 20260825000000_init_schema.sql), a matching auth.identities
-- row for the email provider, and the public.admins row is_admin() checks.

do $$
declare
  v_user_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'admin@photoblinks.local', crypt('localdev123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'admin@photoblinks.local'),
    'email', now(), now(), now()
  );

  insert into public.admins (user_id) values (v_user_id);
end $$;
