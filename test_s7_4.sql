DO $$
DECLARE
    test_location_id uuid;
    test_city_id uuid;
    test_run_id uuid;
    batch_id uuid;
    request_id uuid;
    reservation_id uuid;
BEGIN
    SELECT id INTO test_location_id FROM locations WHERE slug = 'test-location' LIMIT 1;
    SELECT id INTO test_city_id FROM cities WHERE slug = 'test-city' LIMIT 1;
    SELECT id INTO test_run_id FROM ai_maintenance_runs WHERE run_date = CURRENT_DATE LIMIT 1;
    
    INSERT INTO ai_budget_reservations (run_id, entity_type, location_id, owner, reserved_search_queries, reserved_cost_usd, expires_at)
    VALUES (test_run_id, 'location', test_location_id, 'lock_test_worker', 4, 0.05, now() + interval '52 hours')
    RETURNING id INTO reservation_id;
    
    INSERT INTO ai_gemini_batches (run_id, kind, idempotency_key, requested_targets, status)
    VALUES (test_run_id, 'location_verification', 'lock_test_batch_' || gen_random_uuid(), ARRAY[test_location_id], 'preparing')
    RETURNING id INTO batch_id;
    
    INSERT INTO ai_gemini_batch_requests (batch_id, request_key, location_id, reservation_id, status, estimated_cost_usd)
    VALUES (batch_id, 'req_1', test_location_id, reservation_id, 'pending', 0.05)
    RETURNING id INTO request_id;
    
    -- Test with the exact dynamic SQL
    PERFORM test_assert_error(
        'INSERT INTO ai_gemini_batch_requests (batch_id, request_key, location_id, reservation_id, status, estimated_cost_usd) VALUES (''' || batch_id || ''', ''req_2''', ''' || test_location_id || ''', ''' || reservation_id || ''', ''pending'', 0.05)',
        'duplicate key',
        'S7: Unique constraint on reservation_id in batch_requests'
    );
    RAISE NOTICE 'Test done';
END $$;