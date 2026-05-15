# ADR 0009 — Phase 3.4 authors RLS policies; the dead migrations dir is not ported

**Status:** Accepted (2026-05-15). Partially supersedes [ADR 0001](0001-rls.md) (port-plan portion only).

**Decision.** Phase 3.4 will **author** RLS policies and helper functions against the live `apps/server/migrations/` schema. The dead `apps/server/db/migrations/` directory is not a viable migration source and is deleted in Phase 2 Task 2.4 without porting anything.

**Why ADR 0001's "backport" plan doesn't work.** The two schemas diverged at the post-Supabase Rust rewrite (commit `4a0d160 refactor: replace Supabase stack with Rust/Axum backend + PostgreSQL 18`). The dead-dir 010_rls_policies.sql references columns and tables that don't exist in the live schema:

- `media_assets.access_level` — present in dead-dir 008_media.sql, absent in live 00001_initial_schema.sql (live media_assets has only `id, organization_id, filename, content_type, size_bytes, storage_key, uploaded_by, created_at`).
- `media_collections` table — present in dead dir, absent in live.
- `media_permissions` table — present in dead dir, absent in live.

Attempting `sqlx::migrate!` after copying 010 into the live dir fails immediately: `column "access_level" does not exist`.

018 and 021 are more salvageable (their tables and columns mostly exist in live), but porting them without 010's helper functions (`current_app_user_id()`, `is_super_admin()`) would leave the rbac_integration helper tests broken. Partial porting is worse than no porting.

**Consequences.**
- Phase 2 Task 2.4 commits as a pure directory delete: `git rm -r apps/server/db/migrations/` (~3-4k LOC removed). No new migrations added to the live dir.
- Phase 3 Task 3.4 expands scope: in addition to fixing the connection-pinning bug (the half of ADR 0001 that is **not** superseded), it also authors fresh RLS migration(s) against the live schema. The dead 010/018/021 may serve as reference designs but must be schema-checked column-by-column before any line is reused.
- The 5 rbac_integration tests stay at 0/5 passing until Phase 3.4. The S-2 amendment's "fake-green confirmation check" is moot — there was nothing to confirm because the port never happened.
- ADR 0001's connection-pinning plan (RLS context middleware running inside a pinned transaction so `set_config(...)` persists across queries) remains in force unchanged.

**What this ADR does NOT supersede in 0001.**
- The "RLS is defense-in-depth alongside `api/access::*`" decision.
- The connection-pinning + transaction-per-request architectural change.
- The intent to retain RLS in the codebase.
