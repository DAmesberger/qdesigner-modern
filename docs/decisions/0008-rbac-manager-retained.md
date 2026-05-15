# ADR 0008 — Retain RbacManager; delete only rbac/middleware.rs

**Status:** Accepted (2026-05-15). Supersedes ADR 0007.

**Decision.** Keep `apps/server/src/rbac/manager.rs`, `AppState.rbac`, and the construction in `main.rs:85`. Delete only `apps/server/src/rbac/middleware.rs`.

**Why ADR 0007 was wrong.** The audit claim that `RbacManager` is "constructed in main.rs:85 and held in AppState, but never read" is false. `state.rbac` has 28 live call sites across three API modules:

- `apps/server/src/api/projects.rs` — 11 calls (`has_org_role`, `has_project_role`, etc.)
- `apps/server/src/api/organizations.rs` — 13 calls
- `apps/server/src/api/media.rs` — 4 calls

A `cargo check` after attempting the ADR 0007 deletion surfaced 28 compile errors. RbacManager is the authorization-check backbone for every protected handler in those three files; removing it would have broken authorization, not cleaned it up.

**What is actually dead.** Only `rbac/middleware.rs`'s four `require_*` axum middleware helpers — they're declared but never wired into any route. That file is what P1.7 deletes.

**Consequences.**
- ~80 LOC out (middleware.rs), not the ~250 LOC ADR 0007 projected.
- ADR 0007 marked **Superseded by 0008**.
- Phase 3 Task 3.4 (ADR 0001 RLS fix) is unaffected; RLS is a separate enforcement layer that runs alongside `RbacManager` checks and `api/access::*`.
- Future cleanup that wants to consolidate the three-layer authorization (RbacManager + api/access + RLS) into fewer layers is a Phase-3+ refactor and out of scope for the current cleanup.
