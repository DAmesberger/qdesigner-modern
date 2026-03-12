-- Compatibility no-op.
DO $$
BEGIN
    RAISE NOTICE 'Skipping legacy permissions seed: the current schema does not use a permissions table.';
END $$;
