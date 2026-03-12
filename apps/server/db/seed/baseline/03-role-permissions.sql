-- Compatibility no-op.
DO $$
BEGIN
    RAISE NOTICE 'Skipping legacy role_permissions seed: the current schema does not use role-permission joins.';
END $$;
