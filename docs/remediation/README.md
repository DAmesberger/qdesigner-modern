# Roadmap to the 2026 vision — QDesigner Modern

From the 2026-07-04 full-codebase audit (16 lenses → 108 findings) to a state-of-the-art psychological-testing platform.
The audit findings became **62 remediation tasks**; a second workflow verified every task against the live code and
gap-analyzed the codebase against the four product pillars, adding **36 net-new capability epics**. Everything is
sequenced into **8 milestones (M1–M8)** and runnable as a dynamic multi-agent workflow.

- **Audit report:** https://claude.ai/code/artifact/a4970c38-ab0e-4db4-a00d-c5364958926d
- **Remediation plan (62 tasks, 16 waves):** https://claude.ai/code/artifact/612cd2d1-8a3a-4e60-bf1e-5854b99d98a1
- **Product roadmap (verified tasks + epics + milestones):** https://claude.ai/code/artifact/fc7564b7-40ef-4d4e-aa8d-a86a5b97ee96

## The four pillars (current → target readiness)

| Pillar | Now | Target | Shape of the work |
|---|---|---|---|
| Online + offline fillout | 55% | 95% | resumable sessions (linchpin), encryption-at-rest, sync hardening, PWA |
| Precision reaction suite (A/V/image + keying) | 63% | 95% | multi-channel capture, vsync offset, 9 paradigms, provenance export |
| Fully programmable flow (SOTA psych) | 50% | 95% | activate dead plumbing (loops/timers/counterbalancing/CAT/EMA) |
| Instant offline feedback suite | 44% | 90% | wire the built-but-dead scoring engine + designable report page |
| RBAC / projects / multi-tenant | 44% | 90% | project read isolation, audit log, custom perms, SSO/SCIM |

**Central finding: the distance is mostly *activation*, not greenfield.** The hardest engineering (sub-ms precision
clock, seeded flow engine, CAT/IRT engine, psychometric scoring stack, two-tier RBAC) already exists but is dead code
or wired-but-broken (`resume()` only unpauses, `CATEngine` has zero runtime refs, `CompletionScreen` mounts without
scores, `ProjectRole` is write-only).

## Files

| File | What |
|---|---|
| `roadmap.json` | Merged plan: 98 units (62 verified tasks + 36 epics) with step-by-step flows, 5 pillars w/ SOTA matrix, 8 milestones w/ gates+demos, unblock graph. |
| `plan.json` | Original 62-task remediation plan (16 waves, coverage ledger). |
| `findings-index.json` | The 108 audit findings (F001–F108), referenced by each task's `resolves`. |
| `implement-phase.mjs` | Runnable workflow: one implementer agent per unit in an isolated worktree, self-verify, report (no auto-merge). Carries all 807 step-by-step instructions. |

## How to run

```js
// dry-run a milestone first — agents read code + confirm the step-by-step still matches (no edits)
Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M1', dryRun: true } })

// execute — parallel_safe units fan out in isolated git worktrees; the rest run serially
Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M1' } })

// other selectors:
Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { phase: 'P2' } })       // one remediation phase
Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { pillar: 'Reaction' } })// one pillar's epics
Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { batch: 'Wave 1' } })   // one remediation wave
Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { units: ['P1-T1','E-OFF-1'] } })
```

Each agent works in a **private worktree**, follows the unit's step-by-step, runs the automated verification it can,
and reports. **Nothing is committed or merged** — you review each diff.

## The 8 milestones

1. **M1 — Correctness & Security Foundation** (P1+P2). No new features; the platform the epics stand on.
2. **M2 — Resumable Sessions + Test/Type/Structure Backbone** (E-OFF-1, E-FLOW-3 + P3/P4/P5). The resume linchpin two pillars depend on.
3. **M3 — Precision Reaction Core** (E-REACT-1/3/4/5 + P8-T3, P7-T8).
4. **M4 — Instant Feedback Suite Resurrection** (E-FEEDBACK-* + P7-T5). Mostly wiring built-but-dead scoring.
5. **M5 — SOTA Flow Programmability + a11y + Svelte-5** (E-FLOW-4..8 + P6/P7).
6. **M6 — Bulletproof Offline** (E-OFF-2..6 + P8-T1/T2). Encryption, integrity, ack-reconciled sync.
7. **M7 — Multi-tenant Governance + UX Polish** (E-RBAC-1..5/8 + P8 tail). E-RBAC-1 is security-adjacent — closes an active cross-project read gap.
8. **M8 — Enterprise Federation + Adaptive/Longitudinal/Paradigm Frontier** (SSO/SCIM, CAT, EMA, 9 paradigms). Highest estimation variance — de-risk each with a spike; likely split by pillar.

## Discipline (do not skip)

1. **Run milestones in order.** A single fix (P1-T1 variable persistence) unblocks 8 epics — it must land first.
2. **Green the milestone exit gate + prove the exit demo** before advancing (both in `roadmap.json` → `synthesis.milestones`).
3. **Live-browser QA is a required gate** — CI-green has repeatedly not meant "works here," especially for the
   reaction/feedback pillars (dead configs, unmounted score props) and offline/COOP-COEP modes CI doesn't exercise.
4. **Respect the 5 pull-forward reorderings** (P5-T2, P5-T3, P8-T1, P8-T3, P8-T10) noted in `synthesis.sequencing_changes`.
5. **De-risk the XL/high epics with a spike first** — E-OFF-1 (resume), E-FEEDBACK-3 (report page), E-FLOW-1 (CAT),
   E-FLOW-2 (EMA), E-RBAC-6 (SSO), E-RBAC-7 (SCIM). External-standard/IRT surface — naive estimates will be optimistic.
