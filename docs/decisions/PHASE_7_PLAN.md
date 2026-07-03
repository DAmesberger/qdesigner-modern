# Phase 7 — Product-Completion & Wire-Up: Implementation Plan

**Status:** Draft (2026-07-03). Awaiting user approval before P7.1 opens.
**Authority:** ADR 0017 (opens this arc). Evidence: `docs/decisions/PHASE_7_FINDINGS.md` (2026-07-03 audit).
**Phases 1–6 closed:** cleanup/RLS arc complete (main @ df4fbd0). This is a **new arc** — the first product-facing (frontend) arc after the backend/RLS hardening.
**Execution model:** autonomous **loop** (see "Loop operating contract" below), with human decision-gates at architectural forks. This differs from the Phases 1–6 supervisor/team-lead/user triad: here the loop *is* the team-lead, `PHASE_7_FINDINGS.md` *is* the advisory queue, and the user is escalation-only.

---

## Mission (the one goal)

**Close the gap between what QDesigner Modern has *coded* and what a user can actually *do* — without regressing the green gate, and while collapsing the codebase to a single source of truth for theming and components.**

The 2026-07-03 audit found the engineering quality high but ~⅓ of the coded surface unreachable, and — most seriously — that **half the question types silently fail to record participant responses.** The arc is "done" when every audit finding is either fixed, converted to a documented deferral, or refuted at action time, and the exit criteria below hold.

### North-star exit criteria (arc-level)

1. **No silent data loss in fillout.** Every question type in the designer palette either records a real response for participants or is removed from the palette. (P7.1)
2. **Nothing shipped is a dead-end.** No route, nav item, or primary button in the app shell is a mock, a no-op, or points at unmounted code. (P7.1 + P7.2)
3. **One theme, one component per concept.** Exactly one live `variables.css`, one theme-mode store, one overlay primitive, one export service; zero-importer components deleted. (P7.3 + P7.4)
4. **The gate is real and green.** The full verification gate passes locally *and* in CI, and CI actually exercises the backend for e2e. (P7.1)
5. **Every finding is accounted for.** `PHASE_7_FINDINGS.md` has no unchecked box that isn't in the arc "Deferred" register with a rationale.

---

## Loop operating contract

The loop runs one **task cycle** at a time. A task = one unchecked `- [ ]` row in `PHASE_7_FINDINGS.md`, taken from the **active phase**, highest-severity first (`critical` → `high` → `medium` → `low`), ties broken by ledger order.

### The task cycle (do these in order, every time)

1. **Load context.** Read `SUPERVISOR_PROTOCOL.md` (anti-attractor rules A1–A10 are binding), this plan, and the target finding row (title, evidence, action, and any **Correction** — the correction supersedes the original claim).
2. **Probe before acting (mandatory).** Open the cited `file:line` and confirm the finding still holds. **Every finding is a hypothesis** — the audit's cross-reference error rate is ~30% (SUPERVISOR_PROTOCOL "Audit reliability disclosure"). If the code has already changed / the claim is wrong: check the box, annotate the row `→ refuted at action time: <reason>`, commit that annotation, and move on. Do **not** implement a fix for a claim you could not reproduce.
3. **Scope-check.** Confirm the fix fits in **≤ 500 net LOC** (A-rule cap). If larger, split the row into sub-rows in the ledger and take the first. If it needs an architectural decision not covered by an ADR → **STOP** (see guardrails).
4. **Implement the minimal fix.** Reuse existing primitives (there is almost always already a `Button`/`Modal`/`toast`/token for what you need — the audit's recurring theme is *unwired* existing code, not missing code). No new scaffolding (A1). No drive-by refactors outside the finding's scope (goes to Deferred).
5. **Verify against the phase gate** (below). Gate must be green. For UI changes, also drive the affected flow in a browser (the `/verify` and `/run` skills) — `check`/`test` verify types/contracts, not feature correctness (CLAUDE.md).
6. **Commit.** One commit per task (or per tightly-coupled task cluster). Message: `phase-7(P7.x): <ID> — <what changed>`. Body notes any probe finding, any correction to the ledger claim, and any deferral spawned. End with the standard `Co-Authored-By` trailer. **Do not push; do not commit if the gate is red.**
7. **Tick the box** in `PHASE_7_FINDINGS.md` (same commit or a follow-up doc commit) and record any spawned Deferred item in this plan's "Deferred register".
8. **Loop.** Next task. When the active phase's exit criteria hold, run the **phase-gate full report** (below), then advance the active phase.

### Guidelines (how to work — soft rules)

- **Wire, don't rebuild.** The default fix for a "dead X" finding is to *mount/import/route* the existing X, not author a new one. Verify the existing implementation is sound first; only rebuild if it's genuinely broken.
- **Delete cleanly.** For dead-code findings, confirm zero importers with a real grep (`rg "from.*<name>"` + dynamic-import + re-export barrels), then hard-delete — no shims, no "removed for now" comments (A1, and see ADR 0002).
- **Match the surrounding code.** Svelte 5 runes (`$state`/`$derived`/`$props`), semantic tokens (`bg-muted` not `bg-gray-100`), `hsl(var(--token))`. The audit confirms the house idioms; follow them.
- **Terse commits, honest bodies.** If a step was skipped or a test still fails, say so in the body.

### Guardrails (hard rules — STOP and escalate to the user)

A **STOP** means: leave the tree clean (commit or revert), append a `# Decision request` (SUPERVISOR_PROTOCOL format) to the arc log, and wait for the user. Do not guess past these.

- **G1 — Architectural forks need a human + an ADR.** Any finding whose fix changes an architecture contract stops for a decision request and a new ADR *before* code. **`MOD-01` (the fillout rendering contract) is the canonical case and gates all of P7.1's `MOD-*` tasks** — resolve it first (ADR 0018 slot reserved). Others: introducing a per-questionnaire translation data model (`MOD-04`), adding a backend endpoint that doesn't exist (`ADM` role-change), changing the auth/session redirect model (`ERR-01/02`).
- **G2 — The green gate is inviolable on `main`.** Never leave `main` red. Intentional broken intermediates are allowed *only* under the A1-clarification conditions (documented in the commit body, closed within the same session, never the final state of the arc) — SUPERVISOR_PROTOCOL §"A1 clarification".
- **G3 — No deletion without a proven-dead probe.** "0 importers" from the audit is a hypothesis (G-audit-reliability). Re-grep at action time. If anything imports it, it's not dead — reclassify the finding.
- **G4 — `cargo/vite check` ≠ mounted.** Type-clean is not runtime-correct. Any middleware/route/mount change gets an actual runtime probe (curl / browser) before the box is ticked (SUPERVISOR_PROTOCOL §"Cargo check ≠ route-mounted").
- **G5 — Scope cap.** ≤ 500 net LOC per task. Larger → split. Out-of-scope discoveries → Deferred register, never acted on mid-task.
- **G6 — Anti-attractor A1–A10 are binding.** Self-audit each task. A discovered violation is **reverted and redone cleanly**, not patched (SUPERVISOR_PROTOCOL §"Anti-attractor enforcement").
- **G7 — Data-safety findings can't be silently deferred.** Anything in the "no silent data loss" class (`MOD-02`, `MOD-03`, `MOD-05`) may only be *fixed* or *removed-from-palette* — never left shipping as-is.

---

## Verification gate (every task)

The Phase gate from CLAUDE.md. Green = all pass.

```bash
pnpm --filter @qdesigner/web check
pnpm --filter @qdesigner/web test
pnpm --filter @qdesigner/scripting-engine test
pnpm --filter @qdesigner/web build
cargo check --manifest-path apps/server/Cargo.toml
cargo build --manifest-path apps/server/Cargo.toml
cargo test --manifest-path apps/server/Cargo.toml -- --include-ignored
```

Plus, per task class:
- **UI/route/nav change:** drive the flow in a browser (`/verify`), confirm the user-visible behavior — not just the types.
- **e2e change (P7.1):** the affected Playwright lane runs green against a live backend stack.
- **Deletion:** post-delete `pnpm build` proves no dangling import.

Baseline to hold or beat (post-Phase-6, CLAUDE.md): web 43 files/716 passing; scripting-engine 6/223; server 44 tests. Test counts should **rise** across P7.1 (new golden-path + question-type coverage), never fall without a documented reason.

---

## Phase decomposition

Ordered by dependency and blast-radius: correctness first (stops data loss), then wire-up (unlocks value), then the two cleanup sweeps (collapse to single-source), then polish. Each phase is a checkpoint with its own gate and exit criteria. **Do not reorder P7.1 before its `MOD-01` decision-gate.**

### P7.0 — Arc setup (docs only, no product code)

- Write ADR 0017 (this arc), this plan, and `PHASE_7_FINDINGS.md`. ✅ (landing with this commit)
- Capture a Phase-7 baseline row in `baseline.md` (current gate state + test counts + bundle size, so P7.5 perf work has a before/after).
- Reserve ADR slot **0018** for the fillout-rendering-contract decision (G1 / `MOD-01`).
- **Exit:** plan approved by user; baseline captured; branch `phase-7/product-completion` cut from `main`.

### P7.1 — Correctness & Integrity  (24 tasks · 4 critical, 7 high)

**Goal:** eliminate silent data loss and restore a real test signal. Nothing here is deferrable (G7).

- **Decision-gate first:** resolve `MOD-01` → ADR 0018 (mount module runtime components into the HTML overlay for form questions + keep WebGL for reaction-time paradigms, *or* WebGL-only + delete the false capability). This unblocks `MOD-02`, `MOD-03`, `MOD-05`.
- Then: question-type response capture (`MOD-02`), multi-select fix (`MOD-03`), enum-drop reconciliation (`MOD-05`); session-death redirect + auth-guard route prefixes (`ERR-01`, `ERR-02`); e2e restoration — `/test-runtime` tests (`E2E-01`), CI backend stack (`E2E-02`), golden-path→analytics (`E2E-03`), smoke auth (`E2E-04`); production build minify/sourcemap guard (`PRF-01`); the remaining `ERR-*`/`E2E-*` mediums.
- **Gate:** full gate green **in CI including a live backend**; a fresh manual probe confirms each palette question type records a response end-to-end (or is removed).
- **Exit:** exit-criteria 1 & 4 hold. No `critical` box unchecked. Test counts up.

### P7.2 — Wire-Up: built-but-not-mounted  (51 tasks · 10 high)

**Goal:** make every coded-but-unreachable capability reachable, or delete it. Default fix = mount/import/route existing code (Guideline "wire, don't rebuild").

- Designer: Style-tab persistence (`DSN` feature-gaps), VersionManager mount.
- App shell: `/fillout` mock → real API, CommandPalette mount, toast/error-feedback wiring across the silent catch blocks, `window.location` → SPA nav, PageHeader/Container adoption, role-aware nav, Settings stubs.
- Analytics: mount the widget suite / surface the psychometrics (or delete), date-range filter, sparkline N+1.
- Admin: user management actions + the missing role-change endpoint (**G1** — needs backend ADR), real domain verification, org-settings reload, `/admin` client guard.
- Auth: post-login redirect preservation, dual-signup dead-end, cosmetic email verification, onboarding invite branch.
- Help/onboarding: dashboard tour launcher, first-run auto-start.
- **Gate:** full gate green; browser-drive each newly-wired surface.
- **Exit:** exit-criterion 2 holds. No `high` box unchecked without a Deferred entry.

### P7.3 — Theming: single source of truth  (15 tasks · 7 high)

**Goal:** exactly one live theme system. Mostly deletion (~1000 LOC).

- Delete the two orphaned token systems (`THM`/`HCS`/`A11` duplication rows), collapse to one `variables.css` and one theme-mode store; wire *or* delete `rtl.css`; fix the `hsl()`-wrapper bug; replace dark-mode-unsafe hardcoded hex in the designer flow editor with tokens; Tailwind v4/v3-config reconciliation.
- **G3** applies hard here: re-prove each "orphaned" file has zero importers before deleting.
- **Gate:** full gate green; visual check in both light and dark themes; `pnpm build` proves no dangling `@import`.
- **Exit:** exit-criterion 3 (theming half) holds — one `variables.css`, one theme store.

### P7.4 — Dead-code & duplication sweep  (24 tasks · 5 high)

**Goal:** collapse component/service duplication; delete the 18 zero-importer components.

- Delete zero-importer components (re-probe each, G3); collapse Dialog/Modal/Sheet → one overlay **with a real Tab focus trap** (fixes the a11y finding in the same move); adopt `Button`/`PageHeader` primitives across hand-rolled routes; deduplicate the two export services + four CSV serializers (keep the route-wired one); Badge/ui-barrel fix; Monaco-integration consolidation.
- **Gate:** full gate green; deletions proven by build; focus-trap verified by keyboard.
- **Exit:** exit-criterion 3 (component half) holds.

### P7.5 — Polish & performance  (5 tasks + carried mediums · 2 high)

**Goal:** the state-of-the-art finish. Lowest blast radius, do last.

- i18n adoption sweep (designer/analytics/admin `$t` + participant translation once `MOD-04` decided); `prefers-reduced-motion` coverage; designer list virtualization; chunked fillout sync; chart.js theming + dynamic import; carried mediums from other phases.
- **Gate:** full gate green; perf before/after vs the P7.0 baseline (bundle size, large-questionnaire load).
- **Exit:** remaining ledger boxes checked or deferred.

### P7.6 — Closeout (docs only)

- ADR status updates (0017 → Complete; 0018 records the fillout decision); rewrite the affected CLAUDE.md sections (fillout rendering, theming SoT, component inventory); append the Phase 7 row to `baseline.md`; reconcile `PHASE_7_FINDINGS.md` (every box checked or in the Deferred register); hand the Deferred register to the user for next-arc triage.

---

## Deferred register

Out-of-plan discoveries and consciously-deferred findings land here (SUPERVISOR_PROTOCOL §"Out-of-scope rule"). Never acted on mid-task; triaged by the user at closeout.

| Item | From task | Rationale | Disposition |
|---|---|---|---|
| Dedicated `media-display` runtime component | MOD-05 | Aliased to `text-instruction` for now (renders content + media, no silent drop). A purpose-built media-display component is a UX nicety, not a data-loss fix. | Defer |
| Per-type fillout UX verification for ranking / date-time / file-upload / media-response / drawing | MOD-02 | Capture is wired (mounted component → onResponse) and the components read `config` defensively; Matrix + choice are test-proven, the other five need a manual browser pass for layout/validation polish. | Defer (browser-drive in a later P7.1 pass) |
| WebGL presenter chart/display blocks render as placeholder text | MOD-07 / STB-03 | Separate findings; `[bar-chart visualization]` placeholder in the WebGL presenter is out of ADR 0018's form-question scope. | Track under MOD-07/STB-03 |

## Amendment log

Per-step corrections to this plan commit alongside the step (plan-as-architecture-of-record, SUPERVISOR_PROTOCOL §"Plan files as architecture-of-record"). Corrections to original wording are explicit ("Correction to the original P7.x text — …").

- _(none yet)_

## References

- `docs/decisions/0017-product-completion-arc.md` — opens this arc.
- `docs/decisions/PHASE_7_FINDINGS.md` — the complete finding ledger (119 tasks); the loop's work queue.
- `docs/decisions/SUPERVISOR_PROTOCOL.md` — anti-attractor rules A1–A10, subagent contract, verify-first discipline, audit-reliability disclosure (all binding on the loop).
- `docs/decisions/baseline.md` — append Phase 7 baseline (P7.0) and closeout (P7.6) rows.
- `CLAUDE.md` — current architecture; rewrite fillout/theming/component sections in P7.6.
- ADR slot `0018-fillout-rendering-contract.md` — reserved for the `MOD-01` decision (P7.1 decision-gate).
