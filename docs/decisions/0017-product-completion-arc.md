# 0017 — Open the Phase 7 Product-Completion & Wire-Up arc

**Status:** Proposed (2026-07-03). Awaiting user approval.
**Date:** 2026-07-03
**Supersedes:** nothing. First ADR of the product-facing arc (Phases 1–6 were the backend/RLS cleanup arc, closed at main @ df4fbd0).
**Related:** `PHASE_7_PLAN.md` (the executable plan), `PHASE_7_FINDINGS.md` (the evidence ledger), ADR slot 0018 (reserved for the fillout-rendering-contract decision this arc forces).

## Context

A systematic audit was run on 2026-07-03 (a 141-agent adversarial workflow: 13 area surveyors + follow-ups, each finding refuted-or-confirmed by an independent verifier reading the cited code). It produced **123 findings — 92 confirmed, 27 partial/corrected, 4 refuted**; 119 actionable, recorded verbatim in `PHASE_7_FINDINGS.md`.

The audit's verdict: **the engineering quality is high, but ~⅓ of the coded surface is unreachable, and half the question types silently fail to record participant responses.** The dominant defect class is not missing code — it is *coded-but-unwired* code:

- **Silent data loss (critical).** Participant fillout renders exclusively through WebGL (`QuestionPresenter`); the per-module runtime Svelte components are never mounted (`ModularRenderer.svelte` is dead). Six designable question types (matrix, ranking, date-time, file-upload, media-response, drawing) capture no response; multiple-choice collapses to single-select; three enum types are silently dropped.
- **Dead-ends in the shipped UI.** `/fillout` is hardcoded mock data promoted in primary nav; the command palette, VersionManager, the analytics widget/psychometrics suite, and a whole second export service are all coded but never mounted; the property-editor Style tab never persists.
- **No single source of truth for theming/components** (the explicit review ask): the live path is exemplary (shadcn HSL tokens, 1:1 Tailwind mapping) but shadowed by two orphaned `variables.css`/token systems, a second theme-mode store, an unimported 570-line RTL sheet, 18 zero-importer components, and 3 overlapping overlay primitives.
- **The test signal is not real.** 9 e2e specs drive a deleted `/test-runtime` route; no CI job starts the backend, so every API/auth e2e test fails in CI; the valuable fullstack/visual lanes run in no CI job.

The audit itself is a cross-reference product, so per the SUPERVISOR_PROTOCOL "Audit reliability disclosure" its findings carry a ~30% cross-reference error rate and are treated as **hypotheses to verify at action time**, not settled facts — the verifier pass reduces but does not eliminate this.

## Decision

Open **Phase 7 — Product-Completion & Wire-Up**, a bounded arc whose single goal is to close the coded-vs-usable gap and collapse the codebase to a single source of truth for theming and components, without regressing the green gate.

1. **Adopt an autonomous-loop execution model.** `PHASE_7_FINDINGS.md` is the work queue; the loop takes one finding at a time (highest severity first, active phase only), probes it, fixes minimally, verifies against the gate, commits, and ticks the box. The loop's goal/guidelines/guardrails are specified in `PHASE_7_PLAN.md` §"Loop operating contract". This replaces the Phases 1–6 supervisor/team-lead triad with loop + human-decision-gates.
2. **Sequence by blast radius:** P7.1 correctness/integrity (stops data loss) → P7.2 wire-up → P7.3 theming SoT → P7.4 dead-code/duplication → P7.5 polish/perf → P7.6 closeout. Each phase has its own gate and exit criteria.
3. **Force the fillout-rendering-contract decision up front** (ADR 0018): mount module components for form questions + keep WebGL for reaction-time paradigms, *or* commit WebGL-only and delete the false capability. This is a genuine architectural fork (guardrail G1) and gates all dependent question-type work.
4. **Treat data-safety findings as non-deferrable** (guardrail G7): the silent-data-loss class may only be *fixed* or *removed-from-palette*, never shipped as-is.
5. **Carry the SUPERVISOR_PROTOCOL guardrails into the loop unchanged:** anti-attractor rules A1–A10, verify-first, `check ≠ mounted`, ≤500 net LOC/task, clean-delete-no-shims, escalate-on-fork.

## Consequences

- **Positive:** a single tracked source of truth for the product-completion work; every audit finding is captured and cannot be silently lost; the most dangerous defect (participant data loss) is addressed first and gated by a human decision; the arc has objective, testable exit criteria.
- **Cost/risk:** P7.1 requires standing up a real backend-in-CI for e2e, which the cleanup arc never did — non-trivial CI work. The fillout-contract decision (0018) may be large depending on the chosen option. The audit's ~30% cross-reference error rate means a meaningful fraction of ledger rows will be refuted at action time; that is expected and handled by the probe-first cycle (a refuted row is annotated and closed, not fixed).
- **Boundary:** this arc is frontend/product-completion. Backend changes are limited to what wire-up demands (e.g. the missing org-member role-change endpoint), each gated by its own decision/ADR. New feature *invention* beyond closing audited gaps is out of scope → Deferred register.

## Verification

The arc is complete when `PHASE_7_PLAN.md`'s five north-star exit criteria hold, `PHASE_7_FINDINGS.md` has no unchecked box outside the Deferred register, and the full gate is green locally and in CI (with a live backend for e2e). Status flips to **Complete** in P7.6 with the closing SHA recorded here.
