-- Test RLS policies for different users
-- Admin
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"0907731a-94e6-4303-bf6e-bad04d6ec5a1","role":"authenticated"}', true);
SELECT 'admin' as test_user, count(*) FROM ai_field_verification_details;

-- Employee with publish
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dad06cc4-52af-4ce9-8f35-77a10039cc0b","role":"authenticated"}', true);
SELECT 'employee_publish' as test_user, count(*) FROM ai_field_verification_details;

-- Employee without publish
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d1d51c91-81bc-4684-8f74-bde8e01dd382","role":"authenticated"}', true);
SELECT 'employee_no_perm' as test_user, count(*) FROM ai_field_verification_details;