# ADR 0003 — Scripting engine: one home at packages/scripting-engine

**Status:** Accepted (2026-05-15)

**Decision.** Consolidate all scripting code into `packages/scripting-engine/`. Today three homes exist: the package (48 formula functions, mostly unused at runtime), `apps/web/src/lib/scripting-engine/` (the live `VariableEngine` + `ScriptEngine` that actually runs), and `apps/web/src/lib/core/scripting/` (a re-export shim). The CLAUDE.md claim that the in-app directory is a symlink is false.

**Consequences.**
- Phase 2 Task 2.1 moves the live `VariableEngine` and `ScriptEngine` into `packages/scripting-engine/`. Any of the 48 functions reachable from production are kept; the rest are deleted (per A4, not extended).
- `apps/web/src/lib/scripting-engine/` and `apps/web/src/lib/core/scripting/` are deleted in the same change. No re-export barrels (A2).
- All consumer imports rewritten to `@qdesigner/scripting-engine` in the same change (ties into ADR 0004).
- `Variable` interface in the package becomes canonical; `@qdesigner/questionnaire-core` aligns to it (ADR 0005).

## P2.1 migration sub-plan (added 2026-05-15)

Investigation findings before dispatching the move:

### File-by-file scope

The "live" engine in `apps/web/src/lib/scripting-engine/` has 7 files. Only 4 contain real implementation; the other 3 are shims into the package already:

| File | LOC | Status | Move action |
|---|---:|---|---|
| `VariableEngine.ts` | full impl | live, uses `mathjs` | move into `packages/scripting-engine/src/` |
| `ScriptEngine.ts` | full impl | live | move into package |
| `MonacoConfig.ts` | full impl | live, type-only Monaco imports | move into package |
| `VariableEngine.test.ts` | full impl | test for VariableEngine | move into package (runs under package's vitest setup) |
| `index.ts` | barrel | re-exports above + ast/parser | delete; merge exports into package `index.ts` |
| `ast-evaluator.ts` | 2 LOC shim | `export { ASTEvaluator } from '../../../../../packages/scripting-engine/src/ast-evaluator'` | delete (the package's `ast-evaluator.ts` is the real thing) |
| `parser.ts` | 1 LOC shim | `export { FormulaParser } from '../../../../../packages/scripting-engine/src/parser'` | delete (the package's `parser.ts` is the real thing) |

The package already owns `ast-evaluator.ts`, `parser.ts`, `customFunctions.ts`, `evaluator.ts`, `functions/`, `policies.ts`, `types.ts`. No content collision once the in-app shims are deleted.

### 1. mathjs dependency

- Currently declared at `apps/web/package.json:115` (`"mathjs": "^14.5.3"`).
- Consumed by `apps/web/src/lib/scripting-engine/VariableEngine.ts:1` (moving) **and** `apps/web/src/lib/analytics/ScoringPipeline.ts` (staying in apps/web).
- **Plan:** add `"mathjs": "^14.5.3"` to `packages/scripting-engine/package.json` `dependencies`. **Keep** in `apps/web/package.json` because `ScoringPipeline.ts` still imports it. After Phase 2.5 alias adoption, apps/web will resolve `mathjs` via its own node_modules (workspace hoists it anyway).
- No version drift risk: workspace pnpm hoists to a single resolved version.

### 2. Worker bundling

- **Not applicable.** No `?worker`, `new Worker`, or `*.worker.ts` imports anywhere in `apps/web/src/lib/scripting-engine/`. The supervisor's flag was preemptive; reality has no workers.

### 3. `"private": true`

- `packages/scripting-engine/package.json` currently lacks the field.
- `packages/contracts` and `packages/questionnaire-core` both already have it.
- **Plan:** add `"private": true` as part of the P2.1 commit (audit minor #18 cleared in the same change).

### 4. Source-as-main pattern viability

- `packages/scripting-engine/package.json` declares `"main": "./src/index.ts"`, `"types": "./src/index.ts"`, and matching `"exports"`. Vite/SvelteKit consumers transpile the .ts source in-place at build time. This pattern is already working for the package's existing exports (consumed via the shim path); the move just adds more exports.
- `MonacoConfig.ts` uses type-only `monaco-editor` imports (`import type { ... }`, `typeof import('monaco-editor')`). Runtime is supplied by `apps/web` (which has `monaco-editor: ^0.45.0`). **Plan:** add `"monaco-editor": "^0.45.0"` to `packages/scripting-engine/package.json` `devDependencies` so package-level typecheck resolves the types; do not add to `dependencies` because the package doesn't need monaco at runtime.

### 5. Consumer rewrites

- 12 files in `apps/web/src` import `$lib/scripting-engine` or `$lib/scripting-engine/MonacoConfig`. After P2.1 they import `@qdesigner/scripting-engine` and `@qdesigner/scripting-engine/MonacoConfig`.
- This preempts ADR 0004's alias adoption (P2.5) for this one alias. The alias is already declared in `apps/web/svelte.config.js` and `tsconfig.json`; it just hasn't been used yet. P2.1 makes it the first real consumer; P2.5 sweeps the other two (`@qdesigner/contracts`, `@qdesigner/questionnaire-core`).
- The package's `index.ts` needs to add exports for `VariableEngine`, `ScriptEngine`, and the MonacoConfig surface. The MonacoConfig path needs an explicit `exports` block entry in `package.json` since consumers import it as a subpath (`@qdesigner/scripting-engine/MonacoConfig`).

### 6. Variable interface alignment (deferred from ADR 0005)

- P2.2 deferred this because the two `Variable` definitions don't intersect at any consumer (`packages/scripting-engine/src/types.ts` Variable is unused by name — every import resolves through `questionnaire-core`).
- **P2.1 surface:** when `VariableEngine.ts` moves into the package, it imports `Variable` from package's `./types.ts`. If we wanted `questionnaire-core`'s schema-Variable to be canonical (the inverse of ADR 0005's wording), we'd rename the package's existing `Variable` to `EvaluatorVariable` and have it import schema-Variable from `@qdesigner/questionnaire-core`.
- **Decision (supervisor):** defer the rename. Two concepts sharing a name across packages with zero consumer intersection isn't drift, it's coincidence; audit's "schema drift" framing was overstated. Phase 4 may revisit if the coincidence ever causes confusion in practice; otherwise leave.

### 7. Risks

- `VariableEngine.test.ts` currently runs as part of `apps/web`'s vitest (it lives under `apps/web/src/`). After moving into the package, it runs under `packages/scripting-engine`'s vitest (already configured: `"test": "vitest run"` in package scripts). The Phase 1 gate's `pnpm --filter @qdesigner/web test` would no longer include it — need to confirm the root `pnpm test` or workspace setup picks up package-level tests, OR run `pnpm --recursive test`.
- Vite's hoisting may or may not resolve `mathjs` correctly when the package imports it. Will verify with `pnpm install` post-move.
- Risk that the package's existing `ast-evaluator.ts` or `parser.ts` API differs from what `VariableEngine`/`ScriptEngine` expect. The in-app shims passed through, so the API is presumed compatible — but worth a typecheck after move.

### 8. Verification plan post-move

In order:
1. `pnpm install --frozen-lockfile` — must succeed after adding mathjs to package dependencies. If lockfile changes, regenerate and commit.
2. `pnpm --filter @qdesigner/web check` — must remain 0 errors / 0 warnings.
3. `pnpm --filter @qdesigner/scripting-engine test` (or root `pnpm -r test`) — VariableEngine.test.ts runs from the new location, passes.
4. `pnpm --filter @qdesigner/web test` — apps/web suite still 691/691 (since `VariableEngine.test.ts` is no longer counted there, the count drops; confirm the drop is exactly the test count of that file and nothing else).
5. `pnpm --filter @qdesigner/web build` — exit 0.

