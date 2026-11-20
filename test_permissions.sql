-- Test has_permission function directly
SELECT 'admin' as user_type, public.has_permission('locations.publish') as has_publish;
SELECT 'employee_publish' as user_type, public.has_permission('locations.publish') as has_publish;
SELECT 'employee_no_perm' as user_type, public.has_permission('locations.publish') as has_publish;

-- Check is_admin
SELECT 'admin' as user_type, public.is_admin() as is_admin;
SELECT 'employee_publish' as user_type, public.is_admin() as is_admin;
SELECT 'employee_no_perm' as user_type, public.is_admin() as is_admin;