-- 00018_app_role.sql
--
-- Creates the non-superuser, non-BYPASSRLS application role per ADR 0014
-- (decisions D3 + D4 from PHASE_6_PLAN.md). Migrations continue to run
-- as the bootstrap superuser `qdesigner`; the application connects as
-- `qdesigner_app` so RLS policies authored against application traffic
-- actually bind.
--
-- The NOLOGIN → LOGIN flip at the end is intentional: a half-applied
-- migration cannot leave the role usable without a password.
--
-- The password literal here is dev-only. Production hardening (env-
-- sourced / cert auth) is deferred — see ADR 0014 §"Deferred".

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qdesigner_app') THEN
        CREATE ROLE qdesigner_app WITH NOSUPERUSER NOBYPASSRLS NOLOGIN;
    END IF;
END$$;

GRANT USAGE ON SCHEMA public TO qdesigner_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO qdesigner_app;

GRANT USAGE, SELECT
    ON ALL SEQUENCES IN SCHEMA public
    TO qdesigner_app;

-- Future tables/sequences created by later migrations inherit the same
-- grants so subsequent migration authors don't have to remember.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qdesigner_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO qdesigner_app;

ALTER ROLE qdesigner_app WITH LOGIN PASSWORD 'qdesigner_app';
