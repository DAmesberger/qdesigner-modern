# ADR 0018 — Fillout Rendering Contract (Hybrid)

- **Status:** Accepted
- **Date:** 2026-07-03
- **Context arc:** ADR 0017 (Product-Completion). Decision-gate `MOD-01` in `PHASE_7_PLAN.md` (P7.1). Gates the `MOD-*` findings in `PHASE_7_FINDINGS.md`.
- **Supersedes / relates to:** none. Establishes the contract the participant fillout runtime renders against.

## Context

The 2026-07-03 audit surfaced a critical, data-losing gap (`MOD-01`): the participant
fillout runtime (`QuestionnaireRuntime` + `QuestionPresenter`) drew every question via
the WebGL `TextRenderer`/`ImageRenderer` path, while the rich per-module runtime Svelte
components (`MultipleChoice.svelte`, `Matrix.svelte`, …) — the components the designer
palette advertises — had **zero importers** and were never mounted for participants.
Compounding this, the WebGL presentation pipeline never actually painted (`STB-04`:
`TextRenderer`/`ImageRenderer`/`HTMLRenderer` upload a texture then stop before the blit),
and six question types (matrix, ranking, date-time, file-upload, media-response, drawing)
had no functional response capture at all (`MOD-02`), while three enum types (instruction,
media-display, single-choice) had no registered module and were silently dropped at
runtime (`MOD-05`).

Net effect: a researcher could design a study whose questions a participant could not
answer, with **no error and no recorded response** — silent data loss.

Two coherent options were on the table:

- **(a) Hybrid** — mount the existing per-module runtime Svelte components into the
  fillout HTML overlay for *form-style* questions, and keep the WebGL path for
  *reaction-time paradigms* (Stroop/Flanker/IAT/n-back/dot-probe/keypress) where
  frame-exact stimulus timing matters.
- **(b) WebGL-only** — implement the missing texture-blit for every stimulus type and
  delete the runtime Svelte components + `ModularRenderer` as a false "renderable" signal.

## Decision

**Adopt (a), the hybrid contract.**

- **Form-style questions** (category `question` that do **not** register a `questionRuntime`
  v1 contract) render by **mounting their per-module runtime Svelte component into the
  fillout HTML overlay** (`(fillout)/q/[code]/+page.svelte`). Covers: text-input,
  number-input, single-choice, multiple-choice, scale, rating, matrix, ranking, date-time,
  file-upload, media-response, drawing.
- **Instruction / display items** (instruction, media-display, text-instruction) also
  render through the overlay so they are actually visible (the WebGL text path never
  painted).
- **Reaction-time paradigms** — modules that register `questionRuntime.contract === 'v1'`
  (reaction-time, reaction-experiment, webgl) — stay entirely on the WebGL/`ReactionEngine`
  path. Frame-exact onset timing is their reason to exist and the overlay must not touch it.

### Mechanism

The runtime is a plain (non-DOM) TypeScript class and cannot mount Svelte components
itself, so the contract is expressed as a small host interface the page implements:

- `lib/runtime/core/FormQuestionHost.ts` — `FormQuestionHost { present(p); clear() }` and
  the `FormHostPresentation` payload (item, type, category, adapted `config`, variables,
  `interactive`/`required` flags, and an `onSubmit` callback).
- `RuntimeConfig.formHost` (and `FilloutRuntimeConfig.formHost`) carry the host into the
  runtime. When present, `QuestionnaireRuntime.presentQuestion` routes form-style questions
  to `formHost.present(...)` instead of `questionPresenter.present(...)`, and
  `presentNonInteractiveItem` routes instruction/display items the same way. Reaction
  paradigms are excluded by `isFormStyle()` (the v1-runtime check).
- `lib/runtime/core/moduleConfigAdapter.ts` — `buildModuleRuntimeConfig(question)` bridges
  the **impedance mismatch**: the runtime speaks the stored `display`/`responseType` schema;
  the module components read a flat `question.config.*` schema (e.g. `config.options`,
  `config.rows`, `config.responseType`). The adapter maps stored questions into that flat
  config per type, always returning a plain object so components never dereference an
  undefined config.
- `(fillout)/q/[code]/+page.svelte` implements the host: it holds the active presentation
  in Svelte `$state`, mounts `ModularRenderer` (which resolves the runtime component from
  the registry) bound to `currentValue`, and confirms answers with a single **Continue**
  button that calls `onSubmit(currentValue)`. The runtime's `onSubmit` handler funnels the
  value through the existing `handleCollectedResponse` pipeline → `session.responses` →
  `ResponsePersistenceService`, unchanged. Clearing is unified in `clearPresentation()` so
  the host and WebGL presenter are torn down together.

### Enum reconciliation (`MOD-05`)

`register-all.ts` registers three aliases so the previously-dropped enums resolve to a real
handler and render:

- `single-choice` → the `multiple-choice` component in single-select mode.
- `instruction` and `media-display` → the `text-instruction` component (category
  `instruction`), which renders markdown content + media.

A dedicated media-display component is deferred; aliasing to text-instruction removes the
silent drop and shows the item's content/media in the meantime.

## Consequences

- **No silent data loss for form questions** (satisfies `MOD-01`, `MOD-02`, `MOD-05`, and
  builds on the wave-1 `MOD-03` multi-select mapping). Every palette form type now mounts a
  real, answerable component and records a response end-to-end.
- **Two rendering systems coexist by design.** The overlay (DOM) and WebGL (canvas) are now
  a deliberate split, not an accident. The boundary is a single predicate (`isFormStyle`);
  new reaction paradigms opt into WebGL by registering a `questionRuntime` v1 contract.
- **The config adapter is the new coupling surface.** It is the one place that knows both
  schemas. It maps the priority types precisely (choice, matrix, scale, text/number) and
  falls back to a merged `display`+`config` object for the components that read config
  defensively (`ranking`, `date-time`, `file-upload`, `media-response`, `drawing` all use
  `$derived(question.config)` with per-field defaults). Per-type verification of the
  defensive types beyond unit coverage is tracked as follow-up.
- **WebGL blit debt (`STB-04`) is downgraded, not erased.** With form questions on the
  overlay, the un-painting WebGL text path no longer causes participant-facing data loss;
  the blit still matters only for WebGL stimulus overlays used *inside* reaction paradigms.
- **Analytics/display chart blocks in the WebGL presenter** (`MOD-07`, `STB-03`: the
  `[bar-chart visualization]` placeholder) are **out of scope here** and remain deferred.
- **UX shift:** form questions now advance on an explicit Continue click rather than the
  (never-painting) WebGL keyboard capture. This is net-new working behaviour, not a
  regression.

## Verification

- Unit: `moduleConfigAdapter.test.ts` (config mapping), `DocumentStore.responseType.test.ts`
  (`MOD-02`/`MOD-03` response-type mappings), `register-all.test.ts` (`MOD-05` aliases).
- Integration: `fillout-form-capture.test.ts` mounts the real `MultipleChoice` and `Matrix`
  runtime components via the adapter and asserts `onResponse` captures the answer — the exact
  seam the overlay wires into the runtime.
- Full Phase gate green (web check/test/build, scripting-engine test, cargo check/build/test).

## References

- ADR 0017 — opens the Product-Completion arc.
- `docs/decisions/PHASE_7_PLAN.md` — P7.1, `MOD-01` decision-gate (ADR 0018 slot).
- `docs/decisions/PHASE_7_FINDINGS.md` — `MOD-01`, `MOD-02`, `MOD-03`, `MOD-05`.
- `apps/web/src/lib/runtime/core/FormQuestionHost.ts`,
  `moduleConfigAdapter.ts`, `QuestionnaireRuntime.ts` (`presentFormQuestion`/`isFormStyle`).
- `apps/web/src/routes/(fillout)/q/[code]/+page.svelte` — the overlay host.
