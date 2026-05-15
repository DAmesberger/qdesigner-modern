# ADR 0003 — Scripting engine: one home at packages/scripting-engine

**Status:** Accepted (2026-05-15)

**Decision.** Consolidate all scripting code into `packages/scripting-engine/`. Today three homes exist: the package (48 formula functions, mostly unused at runtime), `apps/web/src/lib/scripting-engine/` (the live `VariableEngine` + `ScriptEngine` that actually runs), and `apps/web/src/lib/core/scripting/` (a re-export shim). The CLAUDE.md claim that the in-app directory is a symlink is false.

**Consequences.**
- Phase 2 Task 2.1 moves the live `VariableEngine` and `ScriptEngine` into `packages/scripting-engine/`. Any of the 48 functions reachable from production are kept; the rest are deleted (per A4, not extended).
- `apps/web/src/lib/scripting-engine/` and `apps/web/src/lib/core/scripting/` are deleted in the same change. No re-export barrels (A2).
- All consumer imports rewritten to `@qdesigner/scripting-engine` in the same change (ties into ADR 0004).
- `Variable` interface in the package becomes canonical; `@qdesigner/questionnaire-core` aligns to it (ADR 0005).
