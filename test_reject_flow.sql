-- Simulate rejection flow
-- Test proposal: drone_status (id: 2d6478e2-8392-49af-8897-3373c8e544b0)

-- 1. Check current state
SELECT fd.*, l.drone_status as current_location_value
FROM ai_field_verification_details fd
JOIN ai_location_verification_history h ON h.id = fd.verification_history_id
JOIN locations l ON l.id = h.location_id
WHERE fd.id = '2d6478e2-8392-49af-8897-3373c8e544b0';

-- 2. Reject: Only update field detail review status (rejection never changes locations)
UPDATE ai_field_verification_details
SET review_status = 'rejected', 
    reviewed_by = '0907731a-94e6-4303-bf6e-bad04d6ec5a1',  -- admin user
    reviewed_at = now()
WHERE id = '2d6478e2-8392-49af-8897-3373c8e544b0';

-- 3. Verify location unchanged
SELECT fd.id, fd.field_name, fd.proposed_value, fd.review_status, fd.reviewed_by, fd.reviewed_at, l.drone_status as location_value
FROM ai_field_verification_details fd
JOIN ai_location_verification_history h ON h.id = fd.verification_history_id
JOIN locations l ON l.id = h.location_id
WHERE fd.id = '2d6478e2-8392-49af-8897-3373c8e544b0';