-- Test as admin user (in admins table)
SET ROLE postgres;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"0907731a-94e6-4303-bf6e-bad04d6ec5a1","role":"authenticated"}';

-- Check if admin user is recognized
SELECT public.is_admin() as is_admin;

-- Test admin update of forbidden column
UPDATE ai_field_verification_details
SET proposed_value = 'admin_changed'
WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

SELECT id, field_name, proposed_value, review_status FROM ai_field_verification_details WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

-- Revert
UPDATE ai_field_verification_details SET proposed_value = 'allowed' WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';