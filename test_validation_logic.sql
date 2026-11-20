-- Test approval flow by simulating server action logic
-- We'll directly test the validation logic

-- 1. Get test proposals
SELECT 
  fd.id,
  fd.field_name,
  fd.current_value,
  fd.proposed_value,
  fd.verification_status,
  fd.review_status,
  fd.confidence,
  l.name as location_name,
  l.id as location_id,
  h.id as history_id
FROM ai_field_verification_details fd
JOIN ai_location_verification_history h ON h.id = fd.verification_history_id
JOIN locations l ON l.id = h.location_id
WHERE fd.review_status = 'pending'
AND fd.verification_status = 'verified'
ORDER BY fd.field_name;

-- 2. Test unverified proposal blocking
SELECT 
  fd.id,
  fd.field_name,
  fd.proposed_value,
  fd.verification_status,
  fd.review_status,
  CASE WHEN fd.verification_status != 'verified' THEN 'BLOCKED: unverified' ELSE 'OK' END as approval_check
FROM ai_field_verification_details fd
WHERE fd.review_status = 'pending'
AND fd.field_name = 'shoot_permit_fee';

-- 3. Test enum validation
SELECT 
  fd.id,
  fd.field_name,
  fd.proposed_value,
  CASE 
    WHEN fd.field_name = 'pre_wedding_shoot' AND fd.proposed_value NOT IN ('allowed','conditional','prohibited') THEN 'BLOCKED: invalid enum'
    WHEN fd.field_name = 'drone_status' AND fd.proposed_value NOT IN ('allowed','allowed_with_permission','restricted','prohibited') THEN 'BLOCKED: invalid enum'
    ELSE 'OK'
  END as enum_check
FROM ai_field_verification_details fd
WHERE fd.review_status = 'pending'
AND fd.field_name IN ('pre_wedding_shoot','drone_status','drone_permission');

-- 4. Test stale proposal check
SELECT 
  fd.id,
  fd.field_name,
  fd.current_value,
  fd.proposed_value,
  l.name,
  (CASE 
    WHEN fd.field_name = 'pre_wedding_shoot' THEN l.pre_wedding_shoot
    WHEN fd.field_name = 'drone_status' THEN l.drone_status
    WHEN fd.field_name = 'entry_fee' THEN l.entry_fee
  END) as current_location_value,
  CASE 
    WHEN (CASE 
      WHEN fd.field_name = 'pre_wedding_shoot' THEN l.pre_wedding_shoot
      WHEN fd.field_name = 'drone_status' THEN l.drone_status
      WHEN fd.field_name = 'entry_fee' THEN l.entry_fee
    END) IS DISTINCT FROM fd.current_value THEN 'STALE'
    ELSE 'FRESH'
  END as stale_check
FROM ai_field_verification_details fd
JOIN ai_location_verification_history h ON h.id = fd.verification_history_id
JOIN locations l ON l.id = h.location_id
WHERE fd.review_status = 'pending';