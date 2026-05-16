# Supervisor / Team-Lead Communication Protocol

**Version:** v2 (bumped 2026-05-16 — see ADR 0016 + changelog below)

Authoritative rules for how the supervisor agent and the team-lead agent
exchange messages during QDesigner Modern cleanup work. Both sides read
this file at the start of every round. Updates require user approval +
a new ADR + a header bump.

## Changelog

**v2 (2026-05-16) — lessons from Phases 1–6.** Adds three new rules
(Coverage-checking, Plan files as architecture-of-record, Cargo check
≠ route-mounted, Audit reliability disclosure). Amends A1 to permit
intentional broken intermediates under documented conditions. Amends
phase report format to default-terse. Amends mandatory pre-phase and
pre-advisory actions to make empirical probing + treat-your-own-
advisories-as-hypotheses explicit. Replaces the rigid "3-near-miss
halt" / "4th-strike audit-sweep" threshold with team-lead judgment.
Authority: ADR 0016. Evidence: 10 planning/audit errors caught at
action time across Phases 1–6.

## Roles

- **Supervisor**: reviews phase reports, issues advisories, approves
  phase-to-phase transitions, escalates to the user when a decision is
  required. Does not edit code (docs OK).
- **Team-lead**: plans each phase, spawns subagents, verifies their
  output, reports back. Can edit code. Cannot recurse subagents.
- **User**: final authority. Resolves decisions surfaced by either
  agent. Silence is never consent.

## Message types

| Type             | Direction              | Trigger                                  |
|------------------|------------------------|------------------------------------------|
| Phase report     | team-lead → supervisor | End of every phase                       |
| Advisory         | supervisor → team-lead | After every phase report                 |
| Stop request     | team-lead → supervisor | Mid-phase halt (H-rule or A-rule)        |
| Decision request | either → user          | Anything not covered by existing ADRs    |

## Phase report format (team-lead)

**Terse by default.** Three-line report for routine commits:

1. Commit SHA + one-line description.
2. What changed (high-level) + any mid-step findings.
3. Verification results + proposed next entry point.

**Full structured report** required at:

- Phase gates (end-of-phase wrap-up).
- Surprising findings worth detailed surfacing.
- Cross-phase scope spillover decisions.

Full structure when used:

1. `# Phase N report`
2. `## Branch & commits` — branch name, starting SHA, list of commits added.
3. `## Tasks` — one subsection per task with: status, files touched,
   LOC delta (+x / −y), verification command(s) and result.
4. `## Metrics` — table: baseline vs current for (frontend test count,
   server test count, lint warnings, typecheck warnings, build size if
   tracked).
5. `## Anti-attractor self-audit` — per A1–A10, declare any near-misses
   or judgment calls. "All clear" is acceptable only if true.
6. `## Deferred` — anything noticed but not changed, with rationale.
7. `## Proposed next entry point` — exact next task and dispatch plan.
8. `## Awaiting` — explicit list of what the supervisor needs to approve.

Do not structure for ceremony. If the work doesn't warrant a metrics
table or an anti-attractor self-audit, omit them. The three-line form
is the protocol-compliant default.

## Advisory format (supervisor)

Required sections:

1. `# Advisory for Phase N`
2. `## Verdict` — one of: approved / approved with conditions / blocked.
3. `## Conditions` — numbered list. Team-lead must echo these back before
   acting.
4. `## Forward flags` — heads-up items for later phases. Not blocking.
5. `## Stop and report if` — phase-specific hard stops on top of standard
   H-rules.
6. `## Action` — "Go" / "Hold pending X" / "Blocked — see condition Y".

Advisories for routine work (per-step approvals, simple closeouts) may
omit sections that have no content. The "Action" line is always required.

## Stop request format (team-lead)

1. `# Stop request — Task X.Y`
2. `## Trigger` — cite the H-rule or A-rule, or describe the unknown.
3. `## Working tree state` — committed / reverted / dirty (with paths).
4. `## Options` — at least two, with trade-offs.
5. `## Recommendation` — team-lead's preferred option and why.
6. `## Awaiting` — what answer is needed to unblock.

## Decision request format

1. `# Decision request — <slug>`
2. `## Context` — what surfaced, where (file:line).
3. `## Options` — concrete, mutually exclusive.
4. `## Consequence per option` — what changes downstream.
5. `## Recommendation` — proposed option.
6. `## ADR slot` — proposed filename, e.g. `0017-<slug>.md`.

## Mandatory pre-phase actions (team-lead)

- Read this protocol file.
- Read every ADR in `docs/decisions/` relevant to the phase.
- Read the phase plan file at `docs/decisions/PHASE_N_PLAN.md` if one exists.
- Confirm working branch and clean tree.
- Capture metrics (first phase of an arc) or compare against baseline (later phases).
- Echo back every numbered condition from the last advisory.
- **Empirically probe runtime claims before acting.** Any plan claim,
  ADR premise, or supervisor advisory that depends on runtime behavior
  (DB role attributes, schema column existence, policy binding
  semantics, route mounting, middleware ordering, library behavior)
  gets an empirical probe at the spike, not at first surprise.
  Phase 5–6 caught 10+ planning errors via probes that took <5 minutes
  each. Probing is cheaper than reverting.

## Mandatory pre-advisory actions (supervisor)

- Read the phase report end-to-end.
- Spot-verify at least one factual claim by reading a file or running
  a command. Do not take the team-lead's word on critical outcomes
  (test count, RLS application, etc.).
- Audit the team-lead's anti-attractor self-audit for completeness —
  at minimum check the largest-LOC-delta task by hand.
- Produce conditions as a numbered list. No prose-only conditions.
- **Treat your own advisories as hypotheses.** When the advisory
  contains cross-reference claims (what consumes what, what schema
  looks like, what policy does), accept that your error rate is
  non-trivial. The cleanup arc caught 5 audit errors + 5 advisory/plan
  errors. Include explicit "verify X before acting" calls in
  advisories that depend on cross-reference claims. The team-lead's
  job is to verify; yours is to make verification easy by naming
  specific probes.

## Coverage-checking before forward-reasoning

Architectural-cutover plans (RLS migrations, role switches, alias
migrations, type consolidations) must be authored by walking the code
paths affected, not by reasoning forward from the cutover concept.

- **Forward-reasoning question (insufficient):** "What policies should
  admin tables have?"
- **Coverage-checking question (sufficient):** "What routes touch
  table X? What does each route SELECT/INSERT/UPDATE? Under the new
  state, what happens to each query?"

Phase 6's P6.2 anonymous-read miss was a forward-reasoning failure.
The plan reasoned about "admin tables get policies" without
enumerating that `users` has a public-read path through login. A
coverage check at planning time would have surfaced this before the
migration was authored.

Coverage-check at plan-authoring time, not at execution time.

## Plan files as architecture-of-record

For phases with >3 sub-steps or non-trivial scope, write a
`docs/decisions/PHASE_N_PLAN.md`. Team-lead loads it as source of truth
instead of re-deriving from conversation history.

- Plan file gets amended in-place during the phase. Per-step amendments
  commit alongside the step's other changes.
- The file accumulates ground-truth as the phase progresses; corrections
  to original wording are explicit (e.g., "Correction to the original
  P6.1 text — the plan was wrong. …").
- The next team-lead session loads the plan file before any other context.

Phase 6 introduced this pattern and demonstrably reduced
re-litigation overhead vs the inline advisory-by-advisory approach of
Phases 1–5.

## Approval rules

- "Go" / "Approved" / "Proceed" = explicit consent.
- Silence = not consent. Team-lead must wait.
- "Approved with conditions" → team-lead echoes conditions verbatim in
  next message before starting work.
- Conditional approval expires if the team-lead does not start the
  phase within the same conversation thread.

## Anti-attractor enforcement (joint duty)

- Team-lead self-audits every task against A1–A10. Self-audit reported
  silently for routine work; surface in the phase report only when
  bumping against a rule.
- Supervisor independently checks the worst-case task per phase.
- A discovered violation is **reverted**, not patched over. The fix is
  a new clean commit, not an amendment.

### A1 clarification (broken intermediates)

A1 (no half-built scaffolding) excludes intentional broken intermediates
that are part of a planned multi-step cutover, provided:

- The broken state is documented in the commit body of the commit
  that introduces it.
- The next step (which closes the broken state) lands within the same
  working session.
- The broken state doesn't ship to production (i.e., doesn't sit on
  main as the final state of an arc).

Phases 6.1→6.2 and 6.2→6.3 used this pattern. The original A1 reading
would have forced unrelated changes into one mega-commit, which has
worse review properties than two clean per-step commits with
documented intermediate state.

## Cargo check ≠ route-mounted

`cargo check` and `cargo test` pass for unwrapped routes; the runtime
"middleware not mounted" 500 only surfaces under real traffic.

After any middleware or route-mount change, curl-test affected route
groups before declaring the step done. This is a per-step verification
requirement, not just an end-of-phase check.

Phase 5 batch 1 surfaced this; Phase 6 P6.3 baked it into the per-step
verification gate.

## Out-of-scope rule

- Anything not in the active plan goes into the phase report's
  "Deferred" section.
- Deferred items are never acted on mid-phase.
- At end of each cleanup arc the deferred list goes to the user for
  triage: next arc / future / accept-as-is.

## Mini-phase pattern

Out-of-plan infrastructure defects can be handled as bounded
mini-phases (e.g. `0.5`, `1.0.5`, `1.0.6` naming).

- Supervisor pre-authorization required.
- Scope must be one task, fully reversible.
- Team-lead surfaces when they sense an accumulating pattern of
  defects in the same class; supervisor decides whether to widen into
  a proper sweep phase or continue treating each as a one-off.

Phases 0.5 (toolchain), 1.0.5 (postgres mount), 1.0.6 (broken
pre-build refs) used this pattern successfully without ever requiring
a sweep. The earlier "4th-strike audit-sweep" threshold concept was
never load-bearing; team-lead judgment replaces it.

## Audit reliability disclosure

Audits derived from cross-reference claims (consumers of X, callers of
Y, taxonomies, schema/role behavior) had ~30% error rate across the
cleanup arc. Direct claims (file X exists, function Y is defined) are
more reliable.

Treat any plan or ADR derived from audit cross-reference claims as
starting hypotheses requiring empirical verification at action time.

This isn't a criticism of audits — it's a property of cross-reference
work without execution. The mitigation is verify-first, not better
audits.

## ADR rules

- One decision per file, sequentially numbered, in `docs/decisions/`.
- Each ADR contains: decision, rationale, consequences, date, status.
- ADRs are append-only. To revise, create a new ADR that supersedes
  the old one. Update the superseded ADR's status header + add a
  forward reference to the new ADR.
- Naming: `NNNN-<kebab-slug>.md`.

The cleanup arc demonstrated this scales: ADRs 0007→0008,
0001→0009/0011, 0010→0011, 0011→Phase 6 closeout all used clean
supersession without history rewriting.

## Subagent contract (binding on team-lead)

Every subagent prompt produced by the team-lead must include:

- WHERE: absolute paths in scope, paths explicitly out of scope.
- WHAT: precise deliverable, acceptance criteria.
- VERIFY: exact command(s) the subagent must run before reporting.
- DON'T: anti-attractor rules A1–A10 pasted verbatim.
- REPORT FORMAT: (a) files deleted, (b) files modified with one-line
  reason each, (c) verification command output, (d) deferred list.
- No recursive spawning.
- Hard cap: 500 lines changed net per subagent task. Larger → split.

After subagent returns, team-lead must:

1. Re-run the verification command.
2. Read the diff for anti-attractor violations.
3. If violations: `git restore`, re-plan with tighter scope, re-spawn.
   Do not spawn a "fix-up" subagent on the dirty diff.
4. Mark task complete only after both checks pass.

If a subagent ignores its REPORT FORMAT spec (returns prose instead of
the requested structure), the team-lead may either re-spawn with
stricter wording OR produce the structured output themselves from the
underlying data. For read-only investigation work, doing it themselves
is faster; for code-editing work, re-spawn is required.

## Versioning

This protocol is at v2. Changes require: user approval, a new ADR
documenting the change, and a header bump at the top of this file.
Changelog entries accumulate at the top of this file under
"## Changelog".
