-- Simulate approval flow (assuming auth context works)
-- Test proposal: pre_wedding_shoot (id: e7378201-8146-4e78-ad5f-f7661e4ede52)

-- 1. Check current location value
SELECT pre_wedding_shoot FROM locations WHERE id = 'f43be992-5e98-47c6-8108-da38f3ad8d6a';

-- 2. Check proposal details
SELECT fd.*, l.pre_wedding_shoot as current_location_value
FROM ai_field_verification_details fd
JOIN ai_location_verification_history h ON h.id = fd.verification_history_id
JOIN locations l ON l.id = h.location_id
WHERE fd.id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

-- 3. Approve: Update location field (this is what approveField does)
UPDATE locations SET pre_wedding_shoot = 'allowed' WHERE id = 'f43be992-5e98-47c6-8108-da38f3ad8d6a';

-- 4. Update field detail review status (what approveField does)
UPDATE ai_field_verification_details
SET review_status = 'approved', 
    reviewed_by = '0907731a-94e6-4303-bf6e-bad04d6ec5a1',  -- admin user
    reviewed_at = now()
WHERE id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

-- 5. Verify results
SELECT fd.id, fd.field_name, fd.proposed_value, fd.review_status, fd.reviewed_by, fd.reviewed_at, l.pre_wedding_shoot as location_value
FROM ai_field_verification_details fd
JOIN ai_location_verification_history h ON h.id = fd.verification_history_id
JOIN locations l ON l.id = h.location_id
WHERE fd.id = 'e7378201-8146-4e78-ad5f-f7661e4ede52';

-- Check activity log
SELECT * FROM activity_events WHERE module = 'locations' AND action = 'ai_approved' ORDER BY created_at DESC LIMIT 5;