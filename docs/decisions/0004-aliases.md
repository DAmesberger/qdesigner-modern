# ADR 0004 — Adopt @qdesigner/* workspace aliases fully

**Status:** Accepted (2026-05-15)

**Decision.** Adopt the `@qdesigner/contracts`, `@qdesigner/questionnaire-core`, and `@qdesigner/scripting-engine` aliases everywhere. They are declared in `apps/web/svelte.config.js`, `apps/web/tsconfig.json`, and `apps/web/package.json` but zero source files use them today — everything reaches packages via `../../../../../../packages/...` relative paths.

**Consequences.**
- Phase 2 Task 2.5 rewrites every `../../../../../../packages/...` import in `apps/web/src/` to the corresponding `@qdesigner/*` alias.
- Alias config across `svelte.config.js`, `tsconfig.json`, and the package `dependencies` block is reconciled — no half-state where one file knows about the alias and another doesn't.
- New code is expected to use aliases; relative imports into `packages/` from the web app become a lint signal worth surfacing later.
