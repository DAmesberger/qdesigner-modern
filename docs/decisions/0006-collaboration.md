# ADR 0006 — Keep collaboration (Yjs); document it

**Status:** Accepted (2026-05-15)

**Decision.** Keep the Yjs-based real-time collaboration layer. Investigation (Phase 0) confirmed it is an **active, end-to-end wired feature**, not dormant scaffolding:

- Server: `/api/ws` GET upgrade endpoint mounted at `apps/server/src/api/mod.rs:204`, handler at `apps/server/src/websocket/handler.rs:25`, JWT verified on upgrade, per-channel project-membership check before binary frames, one `yrs::Doc` per `designer:{questionnaire_id}` room.
- Frontend: `Y.Doc` instantiated at `apps/web/src/lib/collaboration/CollaborativeDesigner.ts:40`, initialized from `apps/web/src/routes/(app)/projects/[projectId]/designer/[[questionnaireId]]/+page.svelte:118` whenever a logged-in user opens a questionnaire.
- Dependencies: `yjs@13.6.29`, `y-protocols@1.0.7` (web); `yrs@0.25.0` (server). ~1.2k LOC frontend + ~956 LOC server.
- User-facing: implicit always-on for authenticated designer sessions; presence shown in `DesignerHeader`.

**Consequences.**
- Phase 4 Task 4.3 adds `docs/architecture/collaboration.md` describing the mount point, auth, channel model (`designer:{qid}`), and per-questionnaire Y.Doc lifecycle.
- The `unsafe impl Send/Sync` at `apps/server/src/websocket/yjs_store.rs:27-28` is audited during Phase 3 Task 3.4 (alongside the RLS connection-pinning work) — verify thread-safety or replace with a safe wrapper. Tracked under the Phase 3 deferred list if not addressed there.
- No rollback. No flag-gating. The feature stays as it is.
