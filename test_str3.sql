DO $$
DECLARE
    batch_id uuid := gen_random_uuid();
    test_location_id uuid := gen_random_uuid();
    reservation_id uuid := gen_random_uuid();
    sql_text text;
BEGIN
    sql_text := 'INSERT INTO ai_gemini_batch_requests (batch_id, request_key, location_id, reservation_id, status, estimated_cost_usd) VALUES (' 
        || '''' || batch_id || '''' 
        || $delim$, 'req_2', $delim$
        || '''' || test_location_id || ''''
        || $delim$, $delim$
        || '''' || reservation_id || ''''
        || $delim$, 'pending', 0.05)$delim$;
    
    RAISE NOTICE 'SQL: %', sql_text;
END $$;