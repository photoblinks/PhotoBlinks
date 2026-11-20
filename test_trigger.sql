-- Test trigger column restrictions
-- First, verify current state of a test proposal
SELECT id, field_name, proposed_value, review_status, reviewed_by, reviewed_at, grounded_evidence
FROM ai_field_verification_details 
WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

-- Test 1: Try to UPDATE a forbidden column (proposed_value) - should fail
-- We need to run as a non-admin user with locations.publish permission
-- Since we can't easily set auth context, let's test the trigger function directly
-- by using a DO block with explicit user check

-- Test 2: Valid update (only review_status, reviewed_by, reviewed_at)
UPDATE ai_field_verification_details
SET review_status = 'approved', reviewed_by = 'dad06cc4-52af-4ce9-8f35-77a10039cc0b', reviewed_at = now()
WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

-- Verify the update worked
SELECT id, field_name, proposed_value, review_status, reviewed_by, reviewed_at, grounded_evidence
FROM ai_field_verification_details 
WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

-- Test 3: Try to UPDATE a forbidden column (proposed_value) - should fail
UPDATE ai_field_verification_details
SET proposed_value = 'changed_value'
WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';