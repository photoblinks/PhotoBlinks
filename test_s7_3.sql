DO $$
BEGIN
    PERFORM test_assert_error(
        'SELECT 1/0',
        'division by zero',
        'Test division by zero'
    );
    RAISE NOTICE 'Test done';
END $$;