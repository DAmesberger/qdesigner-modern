# ADR 0023 — Fillout Hybrid Rendering (Finalized)

- **Status:** Accepted
- **Date:** 2026-07-04
- **Context arc:** Phase 8 fillout remediation (`PHASE_8_FILLOUT_FIX_PLAN.md`, Phases 1–5).
  Finalizes the hybrid contract that [ADR 0018](0018-fillout-rendering-contract.md)
  established; relates to [ADR 0011](0011-rls-infra-only.md) (per-request tx the fillout
  writes ride on) and [ADR 0012](0012-fillout-dual-path-rls.md) (the RLS posture that admits
  anonymous fillout traffic).
- **Supersedes / relates to:** does not supersede 0018 — it *completes* it. ADR 0018 mounted
  form-style questions onto the overlay but left the WebGL `QuestionPresenter` path live for
  display/analytics/instruction items and left two never-drawing stacks in the tree. This ADR
  records routing those last items to the overlay and deleting the dead stacks.

## Context

The pre-Phase-8 fillout tree carried **three** parallel rendering stacks, only one of which
ever put pixels on screen:

1. **`ReactionEngine` + `WebGLRenderer`** (`lib/runtime/reaction/`, `lib/renderer/`) — the
   only path that draws. Owns frame-exact stimulus onset for reaction-time paradigms.
2. **`QuestionPresenter` + `lib/runtime/renderers/*`** (Text/Image/Video/Audio/HTML/Composite)
   — every `renderContent` was a placeholder comment; the pipeline uploaded a texture (at
   best) then stopped before the blit. It never painted a question.
3. **`lib/runtime/stimuli/*`** (Text/Image/Video/Audio/Canvas/Composite `Stimulus` +
   `StimulusFactory`) — scaffolding for stack 2; referenced from live code only by a single
   `import type { RenderContext }` in `WebGLRenderer.ts`.

ADR 0018 fixed the participant-facing data loss by mounting the real per-module runtime Svelte
components into the fillout HTML overlay (`FormQuestionHost`) for *form-style* questions. But it
deliberately scoped narrowly: display/analytics/instruction items still routed through the
non-painting `QuestionPresenter.presentModular()` path, and stacks 2 and 3 stayed in the tree as
"looks renderable" signal. That left a codebase where a reader could not tell which of three
stacks was load-bearing, and where a display item still silently failed to render.

Phase 8 (Phases 1–4) additionally hardened the one real stack — data-destroying bug fixes,
offline integrity, reaction-timing correctness, and renderer robustness — which is what makes it
safe to commit to a single WebGL path and delete the alternatives.

## Decision

**The fillout runtime has exactly one WebGL path and one DOM path. Nothing else renders.**

- **WebGL path — `ReactionEngine` + `WebGLRenderer` only.** Reserved for modules that register
  `questionRuntime.contract === 'v1'` (reaction-time, reaction-experiment, webgl). Frame-exact
  stimulus onset is their reason to exist; the overlay must not touch them.
- **DOM path — the `FormQuestionHost` overlay.** *Everything else* renders as Svelte DOM
  mounted into `(fillout)/q/[code]/+page.svelte`:
  - **form-style questions** (already routed here by ADR 0018): text/number-input,
    single-/multiple-choice, scale, rating, matrix, ranking, date-time, file-upload,
    media-response, drawing;
  - **display / analytics / instruction items** (new in Phase 8, slice 5.1): instruction,
    media-display, text-instruction, and the analytics/feedback blocks — their HTML already
    existed inside `QuestionPresenter` but nothing ever drew it. They now route through the same
    host as form questions.
- **The boundary is a single predicate.** `isFormStyle()` in `QuestionnaireRuntime` (the
  v1-runtime check) decides overlay-vs-WebGL for every item. A new reaction paradigm opts into
  WebGL by registering a v1 `questionRuntime`; there is no other switch.

### Dead-stack excision (slice 5.2)

With display/analytics routed to the overlay, `QuestionPresenter` has **no reachable call
site** and the two hollow stacks are unreferenced. Phase 8 deletes them:

- **`QuestionPresenter`** — was imported only by `QuestionnaireRuntime.ts`. Both call sites
  (`present()`, the never-hit form-question WebGL fallback; and `presentModular()`, the
  display/analytics path) go away when those items route to the overlay.
- **`lib/runtime/renderers/*`** (Text/Image/Video/Audio/HTML/Composite/`QuestionRenderer`) — was
  imported only by `QuestionPresenter` (relative `../renderers/…`). Pure dead scaffolding; every
  `renderContent` was a placeholder comment.
- **`lib/runtime/stimuli/*`** — referenced from live code only by `WebGLRenderer.ts`'s
  `import type { RenderContext } from '$lib/runtime/stimuli/Stimulus'`. That **type is moved**
  (inlined into the renderer) *before* the directory is deleted, so the one real stack keeps its
  `RenderContext` contract.
- The `(gl as any).resourceManager` back-channel is removed. The **loader/cache half of
  `ResourceManager` is kept** — it is what the live WebGL path and the media proxy use; only the
  stimulus-graph half tied to stacks 2/3 goes.
- `scanQuestionnaire` is taught about reaction-experiment `config.assets` so asset prefetch no
  longer depended on the deleted stimulus graph.

### Supporting decisions

These three make the single hybrid path correct offline and over time; each was fixed as a
cross-cutting contract before the per-phase work (see the plan's "Cross-cutting contracts").

- **D1 — same-origin, stable media URLs.** Media resolves through a streaming proxy
  `GET /api/media/{id}/content` on the API origin instead of expiring presigned MinIO URLs. One
  move fixes three problems at once: cross-origin WebGL texture taint, COEP `require-corp`, and
  the offline Cache-API expiry/keying problem (the cache key is now a stable path;
  `Cache-Control: immutable`; Range support for video seeking). Fillout runtimes re-resolve
  media to the proxy from `mediaId`; the designer keeps presigned URLs (a `Bearer` token can't
  ride an `<img src>`). The anon-read policy on `media_assets` is org-scoped to avoid a
  cross-tenant leak.
- **D2 — one offline-first write path for results.** Every response/event/variable is written to
  IndexedDB first (each carrying a `clientId` UUID), then `FilloutSyncEngine.syncNow()` is
  triggered when online. Server `ON CONFLICT (client_id) DO NOTHING` makes replay idempotent.
  The buggy online direct-submit mapper (which dropped `reaction_time_us`/`presented_at`/
  `answered_at` on the snake↔camel boundary) is deleted — there is no second write path.
- **Version pinning.** A session pins the exact `(questionnaireId, major.minor.patch)` plus the
  definition snapshot it started against; resumed and offline sessions load the *pinned*
  snapshot, never the latest cached one. Media cache LRU never evicts a version pinned by an
  unsynced session.

### Timing claim (corrected)

The historical "microsecond-accurate reaction time measurements" wording is **not supportable**
and was corrected repo-wide in Phase 3. The real guarantee is **frame-accurate onset**
(display-latency corrected, output-latency-corrected for audio) with **sub-millisecond
*relative* precision** from high-resolution input timestamps — not microsecond-*absolute*
timing. Full timer resolution additionally requires the COOP/COEP cross-origin-isolation
headers. Every persisted trial carries a `timing_provenance` blob
(`onsetMethod`, `responseMethod`, latencies, `anticipatory`/`falseStart` flags, frame stats)
so downstream analysis can see how each number was obtained (server column
`responses.timing_provenance JSONB`).

## Consequences

- **One WebGL path, one DOM path — legible by construction.** A reader no longer has to reverse
  three stacks to find the one that draws. The overlay renders all form/display/instruction/
  analytics content; WebGL renders only v1 reaction stimuli; `isFormStyle()` is the only fork.
- **Net line deletion, no behaviour loss.** The deleted stacks never drew a pixel, so removing
  them cannot regress a participant-facing surface. What *was* broken (display items not
  showing) is fixed by routing them to the overlay, not by reviving the dead path.
- **`RenderContext` now lives with its one consumer.** Inlining the type into the renderer
  removes the last live dependency on `lib/runtime/stimuli/` and stops the type from advertising
  a stimulus system that no longer exists.
- **`ResourceManager` is bisected on purpose.** Loader/cache stays (live); stimulus-graph goes.
  Future asset work extends the loader half, not a rebuilt stimulus graph.
- **The config adapter (ADR 0018) remains the coupling surface** between the runtime's stored
  `display`/`responseType` schema and the components' flat `config.*` schema. Nothing here
  changes that seam.
- **Offline is a single, idempotent write path (D2)** and media is same-origin and cache-stable
  (D1); the two together are what let a fully-offline fillout reconcile exactly-once on
  reconnect.
- **The old blit debt (`STB-04`) is closed for participants.** No form/display content depends
  on the WebGL text blit anymore; the blit matters only for stimulus overlays *inside* reaction
  paradigms, which is the one place WebGL is still authoritative.

## Verification

- Per-phase gates in `PHASE_8_FILLOUT_FIX_PLAN.md`: svelte-check/tsc 0 errors; web suite grew to
  **800 passing** by Phase 4 (persistence-timing, offline-roundtrip, deterministic
  `ReactionEngine` with mock renderer + injected clock, and `WebGLRenderer`/engine robustness
  tests); scripting-engine test green; `cargo check`/`cargo test -- --include-ignored` green
  (**server 44**, migrations 00024/00025/00026 apply in order on a clean DB).
- Each phase carried a live-browser fillout golden-path gate in addition to type/test green
  (type/test green has demonstrably lied about this surface — the prompt-never-renders bug
  passed a green suite).

## References

- `docs/decisions/PHASE_8_FILLOUT_FIX_PLAN.md` — the full Phase 1–5 scope (slice 5.3 = this ADR).
- [ADR 0018](0018-fillout-rendering-contract.md) — established the hybrid contract this ADR
  finalizes (overlay for form questions; WebGL for v1 reaction paradigms).
- [ADR 0011](0011-rls-infra-only.md) — per-request transaction infra the fillout writes ride on.
- [ADR 0012](0012-fillout-dual-path-rls.md) — dual-path RLS admitting anonymous fillout traffic;
  media/`questionnaire_definitions` read posture the D1 proxy depends on.
- `apps/web/src/lib/runtime/reaction/ReactionEngine.ts`,
  `apps/web/src/lib/renderer/WebGLRenderer.ts` — the sole WebGL path.
- `apps/web/src/lib/runtime/core/FormQuestionHost.ts`, `moduleConfigAdapter.ts`,
  `QuestionnaireRuntime.ts` (`isFormStyle`), `(fillout)/q/[code]/+page.svelte` — the DOM overlay.
