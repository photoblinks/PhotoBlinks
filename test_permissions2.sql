BEGIN;

-- Admin
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"0907731a-94e6-4303-bf6e-bad04d6ec5a1","role":"authenticated"}';
SELECT 'admin' as user_type, public.has_permission('locations.publish') as has_publish, public.is_admin() as is_admin, count(*) as visible_rows FROM ai_field_verification_details;

-- Employee with publish
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dad06cc4-52af-4ce9-8f35-77a10039cc0b","role":"authenticated"}';
SELECT 'employee_publish' as user_type, public.has_permission('locations.publish') as has_publish, public.is_admin() as is_admin, count(*) as visible_rows FROM ai_field_verification_details;

-- Employee without publish
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d1d51c91-81bc-4684-8f74-bde8e01dd382","role":"authenticated"}';
SELECT 'employee_no_perm' as user_type, public.has_permission('locations.publish') as has_publish, public.is_admin() as is_admin, count(*) as visible_rows FROM ai_field_verification_details;

COMMIT;