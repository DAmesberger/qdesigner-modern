# Supervisor / Team-Lead Communication Protocol

**Version:** v1

Authoritative rules for how the supervisor agent and the team-lead agent
exchange messages during the QDesigner Modern cleanup. Both sides read this
file at the start of every round. Updates require user approval.

## Roles

- **Supervisor**: reviews phase reports, issues advisories, approves
  phase-to-phase transitions, escalates to the user when a decision is
  required. Does not edit code.
- **Team-lead**: plans each phase, spawns subagents, verifies their output,
  reports back. Can edit code. Cannot recurse subagents.
- **User**: final authority. Resolves decisions surfaced by either agent.
  Silence is never consent.

## Message types

| Type             | Direction              | Trigger                                  |
|------------------|------------------------|------------------------------------------|
| Phase report     | team-lead → supervisor | End of every phase                       |
| Advisory         | supervisor → team-lead | After every phase report                 |
| Stop request     | team-lead → supervisor | Mid-phase halt (H1–H8 or A1–A10 trigger) |
| Decision request | either → user          | Anything not covered by existing ADRs    |

## Phase report format (team-lead)

Required sections in this order:

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

## Advisory format (supervisor)

Required sections:

1. `# Advisory for Phase N`
2. `## Verdict` — one of: approved / approved with conditions / blocked.
3. `## Conditions` — numbered list. Team-lead must echo these back before
   acting.
4. `## Forward flags` — heads-up items for later phases. Not blocking.
5. `## Stop and report if` — phase-specific hard stops on top of standard
   H1–H8.
6. `## Action` — "Go" / "Hold pending X" / "Blocked — see condition Y".

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
6. `## ADR slot` — proposed filename, e.g. `0008-<slug>.md`.

## Mandatory pre-phase actions (team-lead)

- Read this protocol file.
- Read every ADR in `docs/decisions/`.
- Confirm working branch and clean tree.
- Capture metrics (first phase) or compare against baseline (later phases).
- Echo back every numbered condition from the last advisory.

## Mandatory pre-advisory actions (supervisor)

- Read the phase report end-to-end.
- Spot-verify at least one factual claim by reading a file or running a
  command. Do not take the team-lead's word on critical outcomes (test
  count, RLS application, etc.).
- Audit the team-lead's anti-attractor self-audit for completeness — at
  minimum check the largest-LOC-delta task by hand.
- Produce conditions as a numbered list. No prose-only conditions.

## Approval rules

- "Go" / "Approved" / "Proceed" = explicit consent.
- Silence = not consent. Team-lead must wait.
- "Approved with conditions" → team-lead echoes conditions verbatim in
  next message before starting work.
- Conditional approval expires if the team-lead does not start the phase
  within the same conversation thread.

## Anti-attractor enforcement (joint duty)

- Team-lead self-audits every task against A1–A10 in the phase report.
- Supervisor independently checks the worst-case task per phase.
- A discovered violation is **reverted**, not patched over. The fix is a
  new clean commit, not an amendment.
- If three near-misses occur in one phase, the supervisor halts the round
  and escalates to the user.

## Out-of-scope rule

- Anything not in the active plan goes into the phase report's "Deferred"
  section.
- Deferred items are never acted on mid-phase.
- At end of Phase 4 the deferred list goes to the user for triage:
  Phase 5 / future / accept-as-is.

## ADR rules

- One decision per file, sequentially numbered, in `docs/decisions/`.
- Each ADR contains: decision, rationale, consequences, date, status.
- ADRs are append-only. To revise, create a new ADR that supersedes the
  old one and update its status.
- Naming: `NNNN-<kebab-slug>.md`.

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

## Versioning

This protocol is at v1. Changes require: user approval, a new ADR
documenting the change, and a header bump at the top of this file.
