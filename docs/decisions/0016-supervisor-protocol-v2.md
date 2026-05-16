# ADR 0016 — SUPERVISOR_PROTOCOL.md v2

**Status:** Accepted (2026-05-16). Bumps SUPERVISOR_PROTOCOL.md from v1
to v2.

## Decision

Amend SUPERVISOR_PROTOCOL.md based on lessons from Phases 1–6 of the
QDesigner Modern cleanup arc. Three new rules, four amendments,
versioning bumped to v2.

## Changes

### New rules

- **Coverage-checking before forward-reasoning.** Architectural cutover
  plans must be authored by walking affected code paths, not by
  reasoning forward from the cutover concept.
- **Plan files as architecture-of-record.** For phases with >3 sub-steps,
  write `docs/decisions/PHASE_N_PLAN.md` as source of truth. Plan file
  is amended in-place during the phase.
- **Cargo check ≠ route-mounted.** After any middleware or route-mount
  change, curl-test affected route groups before declaring the step done.

### Amendments

- **Phase report format defaults to terse.** Three-line report for
  routine commits; full structured report reserved for phase gates and
  genuinely surfacing findings.
- **A1 clarification.** A1 (no half-built scaffolding) excludes
  intentional broken intermediates that are part of a planned
  multi-step cutover, provided the broken state is documented in the
  commit body, the closing step lands within the same working session,
  and the broken state doesn't sit on main as the final state.
- **Empirical probing made explicit in pre-phase actions.** Runtime
  claims get empirical probes at the spike, not at first surprise.
- **Supervisor advisories as hypotheses.** Pre-advisory actions now
  include treating own cross-reference claims as hypotheses requiring
  verification.
- **Mini-phase pattern formalized; 4th-strike threshold dropped.**
  Replaces rigid rule with team-lead judgment for surfacing
  accumulating defect patterns.
- **Audit reliability disclosure.** New section noting ~30% error rate
  on cross-reference audit claims; treat as starting hypotheses.

## Rationale

The cleanup arc surfaced 10 planning/advisory/audit errors caught at
action time (5 audit cross-reference errors in Phases 1–4, 2 ADR errors
in Phase 5, 3 plan errors in Phase 6). All were caught cleanly by the
team-lead's verify-first discipline. The v1 protocol implicitly assumed
verification flowed downward (supervisor → team-lead); empirically it
must also flow upward (team-lead probes claims from above).

Phase 6's PHASE_6_PLAN.md pattern produced the cleanest phase execution
of the arc — the team-lead loaded the plan file as source of truth and
didn't re-derive intent from conversation history. Codifying this
pattern enables future cleanup arcs to start with the same scaffolding.

The "3 near-misses halts the round" rule in v1 never triggered usefully
across the arc and would have created ceremony at no benefit. Replacing
it with team-lead judgment matches actual practice.

A1's strict reading would have forced P6.1+P6.2 and P6.2+P6.3 into
mega-commits, sacrificing per-step commit hygiene to satisfy a "no
broken intermediates" reading that was never the rule's intent. The
clarification preserves A1's spirit (no scaffolding shipped to main)
while permitting the per-step pattern that the rest of the protocol
endorses.

## Consequences

- Future team-lead sessions read v2 of the protocol; behavior should
  trend toward terser reports, more empirical probing at spike time,
  and plan files for non-trivial phases.
- v1 phase reports (Phases 1–5) retroactively don't comply with v2's
  terse-default. This is fine — v2 applies prospectively. The arc
  itself documents the calibration journey.
- Cleanup arcs beyond Phase 6 (if any) should benefit from reduced
  re-litigation overhead and earlier defect catches.

## Status

Accepted 2026-05-16. SUPERVISOR_PROTOCOL.md header bumped to v2 in
the same commit as this ADR.
