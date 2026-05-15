# ADR 0005 — Keep questionnaire-core as a separate package

**Status:** Accepted (2026-05-15)

**Decision.** Keep `packages/questionnaire-core/` separate from `packages/contracts/`. The boundary is clear: `contracts/` is OpenAPI-generated transport types; `questionnaire-core/` is hand-authored domain types (`Questionnaire`, `Page`, `Question`, `Variable`, etc.). Mixing generated and authored code under one package would confuse codegen ownership.

**Consequences.**
- Phase 2 Task 2.2 picks one type root inside the web app (`lib/shared/types/` XOR `lib/types/`), reconciles the diverged `renderer.ts`, and deletes the loser directory.
- The `Variable` interface in `@qdesigner/questionnaire-core` is aligned with the canonical definition in `@qdesigner/scripting-engine` (ADR 0003). One definition wins; the other imports it.
- `apps/web/src/lib/questionnaire/types/` (orphan duplicate) is removed in Phase 1 Task 1.3.
