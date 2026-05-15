# ADR 0002 — Delete lib/pipeline

**Status:** Accepted (2026-05-15)

**Decision.** Delete `apps/web/src/lib/pipeline/` (~4.7k LOC: `PipelineManager`, `QueueManager`, `StreamingService`). Audit found zero consumers outside the directory and no documented use case. Git history preserves the code if the pattern is needed later.

**Consequences.**
- Phase 1 Task 1.5 removes the directory in one commit.
- No follow-up scaffolding, re-export shims, or "// removed for now" comments — clean delete per anti-attractor rule A1.
- Any future "pipeline" need starts from current requirements, not from re-resurrecting this code.
