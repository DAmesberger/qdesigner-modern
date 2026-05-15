-- 00022_force_rls_admin.sql
--
-- FORCE ROW LEVEL SECURITY on the four still-RLS-bound admin tables.
-- The plan's P6.5 originally listed six admin tables; the two
-- RLS-exempted-by-ADR-0015 tables (users, organizations) are skipped
-- here because FORCE on a non-RLS-enabled table is vestigial. If a
-- future ADR re-enables RLS on either, FORCE should be applied in the
-- same migration that re-enables.
--
-- Empirical probe pre-application (recorded for the ADR 0011 →
-- ADR 0012/0013/0014 closeout):
--
--   * As qdesigner_app (non-owner, non-BYPASSRLS), `SELECT COUNT(*) FROM
--     project_members` with no `app.user_id` GUC returned 0 rows
--     pre-FORCE. RLS already binds for the application role because
--     qdesigner_app is not the table owner; ENABLE alone is enough.
--   * As qdesigner (migration role, SUPERUSER + BYPASSRLS), the same
--     query returned all rows pre-FORCE. RLS bypassed regardless of
--     policy authorship.
--
-- Conclusion: this migration is belt-and-suspenders defense against
-- the migration role accidentally reading application data with no
-- GUC set. It does not change the binding behaviour for qdesigner_app.

ALTER TABLE public.organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.projects             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_members      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets         FORCE ROW LEVEL SECURITY;

-- Operational note: any future migration that needs to bulk-update
-- these tables across tenants must either (a) issue the work via a
-- superuser connection that the SUPERUSER attribute still bypasses
-- — qdesigner has it — or (b) temporarily NO FORCE the table for the
-- duration of the migration. Option (a) is what happens by default
-- because migrations run on the qdesigner DSN.
