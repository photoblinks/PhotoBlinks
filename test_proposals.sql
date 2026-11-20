INSERT INTO ai_field_verification_details (
  verification_history_id,
  field_name,
  current_value,
  proposed_value,
  verification_status,
  grounded_evidence,
  source_urls,
  confidence,
  review_status
) VALUES 
  -- Verified, pending approval - pre_wedding_shoot
  ('942a89dc-967e-4330-aec5-e728f3c933c8', 'pre_wedding_shoot', NULL, 'allowed', 'verified', 
   'Source confirms pre-wedding shoots are permitted with conditions.', 
   ARRAY['http://test2.com'], 0.90, 'pending'),
  -- Verified, pending approval - drone_status
  ('942a89dc-967e-4330-aec5-e728f3c933c8', 'drone_status', NULL, 'allowed_with_permission', 'verified',
   'Drone usage requires permission from venue management.',
   ARRAY['http://test2.com'], 0.85, 'pending'),
  -- Verified, pending approval - entry_fee
  ('942a89dc-967e-4330-aec5-e728f3c933c8', 'entry_fee', NULL, 'Rs. 500 per person', 'verified',
   'Entry fee confirmed at Rs. 500 per person.',
   ARRAY['http://test2.com'], 0.88, 'pending'),
  -- Unverified - should be blocked
  ('942a89dc-967e-4330-aec5-e728f3c933c8', 'shoot_permit_fee', NULL, 'unknown', 'unverified',
   'Could not verify shoot permit fee.',
   ARRAY['http://test2.com'], 0.30, 'pending'),
  -- Already approved - prior_booking
  ('942a89dc-967e-4330-aec5-e728f3c933c8', 'prior_booking', NULL, 'required', 'verified',
   'Prior booking required per venue policy.',
   ARRAY['http://test2.com'], 0.82, 'approved')
ON CONFLICT (verification_history_id, field_name) DO UPDATE SET
  current_value = EXCLUDED.current_value,
  proposed_value = EXCLUDED.proposed_value,
  verification_status = EXCLUDED.verification_status,
  grounded_evidence = EXCLUDED.grounded_evidence,
  source_urls = EXCLUDED.source_urls,
  confidence = EXCLUDED.confidence,
  review_status = EXCLUDED.review_status;

-- Insert invalid enum test separately (different field to avoid conflict)
INSERT INTO ai_field_verification_details (
  verification_history_id,
  field_name,
  current_value,
  proposed_value,
  verification_status,
  grounded_evidence,
  source_urls,
  confidence,
  review_status
) VALUES 
  -- Invalid enum for pre_wedding_shoot - should be blocked
  ('942a89dc-967e-4330-aec5-e728f3c933c8', 'drone_permission', NULL, 'invalid_value', 'verified',
   'Invalid test value for drone_permission.',
   ARRAY['http://test2.com'], 0.70, 'pending')
ON CONFLICT (verification_history_id, field_name) DO UPDATE SET
  current_value = EXCLUDED.current_value,
  proposed_value = EXCLUDED.proposed_value,
  verification_status = EXCLUDED.verification_status,
  grounded_evidence = EXCLUDED.grounded_evidence,
  source_urls = EXCLUDED.source_urls,
  confidence = EXCLUDED.confidence,
  review_status = EXCLUDED.review_status;