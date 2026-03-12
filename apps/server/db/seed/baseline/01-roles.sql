-- Compatibility no-op.
-- Authorization is membership-based in the current schema.
DO $$
BEGIN
    RAISE NOTICE 'Skipping legacy roles seed: the current schema does not use a roles table.';
END $$;
