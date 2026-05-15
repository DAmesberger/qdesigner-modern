# ADR 0007 — Delete RbacManager and rbac middleware

**Status:** Superseded by [ADR 0008](0008-rbac-manager-retained.md) (2026-05-15)

**Decision.** Delete `apps/server/src/rbac/manager.rs` and `apps/server/src/rbac/middleware.rs`. `RbacManager` is constructed at `apps/server/src/main.rs:85` and held in `AppState`, but never read. The four `require_*` helpers in `rbac/middleware.rs` are never wired into any route.

**Consequences.**
- Phase 1 Task 1.6 removes both files, the field from `AppState`, and the construction in `main.rs`. ~250 LOC out.
- Authorization continues via the two layers that actually run: `api/access::*` application-level checks plus RLS (once ADR 0001 lands in Phase 3). No third layer.
- If a future need for role-based middleware emerges, it starts from the requirement, not from this resurrected code.
