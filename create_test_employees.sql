-- Create employee with locations.publish permission (operations role)
INSERT INTO employees (user_id, role_id, full_name, is_active)
VALUES 
  ((SELECT id FROM auth.users WHERE email = 'employee_publish@test.local'), 
   (SELECT id FROM employee_roles WHERE slug = 'operations'),
   'Test Employee Publish', true);

-- Create employee without publish permission (analyst role)
INSERT INTO employees (user_id, role_id, full_name, is_active)
VALUES 
  ((SELECT id FROM auth.users WHERE email = 'employee_no_perm@test.local'), 
   (SELECT id FROM employee_roles WHERE slug = 'analyst'),
   'Test Employee No Perm', true);

SELECT e.*, er.name as role_name FROM employees e JOIN employee_roles er ON er.id = e.role_id;