# Ticket reconciliation — 2026-09-11

The user authorized GitHub ticket reconciliation after confirming immediate removal
of JavaScript hooks and continued PCA delivery. This record follows the
[ADR reconciliation](decisions/README.md) and the earlier
[codebase audit](codebase-requirements-audit-2026-09-11.md).

## Decisions and delivery tickets

| Tickets | Reconciliation |
|---|---|
| [#54](https://github.com/DAmesberger/qdesigner-modern/issues/54) | Refreshed the program map with published specifications, resolved decisions, outstanding evidence and current implementation status. |
| [#75](https://github.com/DAmesberger/qdesigner-modern/issues/75), [#89](https://github.com/DAmesberger/qdesigner-modern/issues/89), [#90](https://github.com/DAmesberger/qdesigner-modern/issues/90), [#91](https://github.com/DAmesberger/qdesigner-modern/issues/91) | Immediate JavaScript removal; no replacement-first compatibility period. Safe Logic replacement outcomes remain required. Removed #91's native blockers #89/#90. |
| [#145](https://github.com/DAmesberger/qdesigner-modern/issues/145) | Created required PCA analytics UI delivery work with numerical, input, authorization and researcher-workflow acceptance criteria. |
| [#146](https://github.com/DAmesberger/qdesigner-modern/issues/146) | Created external embedding work covering the framing/isolation contract and delivery evidence; implementation readiness awaits that technical design. |
| [#69](https://github.com/DAmesberger/qdesigner-modern/issues/69) | Closed the MCP adapter decision as completed by the already published #75 contract. Implementation #97–#102 remains open. |
| [#33](https://github.com/DAmesberger/qdesigner-modern/issues/33) | Preserved completed module-owned response validity and recorded the successor removing JavaScript validation behavior. |

## Evidence and remaining design work

- [#55](https://github.com/DAmesberger/qdesigner-modern/issues/55),
  [#59](https://github.com/DAmesberger/qdesigner-modern/issues/59),
  [#71](https://github.com/DAmesberger/qdesigner-modern/issues/71),
  [#73](https://github.com/DAmesberger/qdesigner-modern/issues/73): complete
  individual capability coverage, publish/pin artifacts, finish the capability
  delta and reconcile the already existing specification tranches.
- [#58](https://github.com/DAmesberger/qdesigner-modern/issues/58),
  [#63](https://github.com/DAmesberger/qdesigner-modern/issues/63),
  [#64](https://github.com/DAmesberger/qdesigner-modern/issues/64),
  [#68](https://github.com/DAmesberger/qdesigner-modern/issues/68): narrowed the
  remaining transaction, semantic-inventory and prototype evidence work around
  contracts already specified in #75. These tickets remain open.
- [#66](https://github.com/DAmesberger/qdesigner-modern/issues/66): linked the
  existing hardware/response decision (renumbered ADR 0037), distinguished sensor
  feasibility work from broader integration approval, and preserved unresolved
  client hardware outcomes.
- [#76](https://github.com/DAmesberger/qdesigner-modern/issues/76): recorded the
  locally implemented text-only round-trip tracer and its contract/UI evidence;
  publication and review remain before closure.
- [#104](https://github.com/DAmesberger/qdesigner-modern/issues/104),
  [#116](https://github.com/DAmesberger/qdesigner-modern/issues/116): corrected the
  claim that WebGL video/rVFC groundwork is missing. Procedure-specific acceptance
  and dedicated Video-Stop delivery remain outstanding.
- [#51](https://github.com/DAmesberger/qdesigner-modern/issues/51): corrected the
  permanent-data-loss claim to automatic sync failure with locally recoverable
  records; retained the delivery/retry failure and its urgency.

## Publication boundary

At reconciliation, local HEAD is `9e5fdcc3e4bc19decf2dc24250adf0dd6963e337` and
published main is `e99379a7249ef9e0e4a0a38b0583c0a5927fc8a0`. ADR reconciliation
and JavaScript removal are uncommitted; several requirements/evidence files are
untracked. The ticket bodies reproduce binding decisions and identify local
implementation evidence explicitly, without links that pretend those files
already exist on main. No implementation ticket was closed on local-only evidence.

At initial reconciliation, #91 recorded 1,897 passing local unit test executions
and passing checks/build; the reintroduction guard and browser evidence were still
outstanding. The subsequent acceptance milestone below supersedes that snapshot
and corrects duplicate package-test discovery. These checks do not certify the
complete Safe Logic/QDef/MCP implementation.

## Verification

Read back all 20 edited existing tickets and both new tickets from GitHub and
verified their exact bodies, intended titles and states. Confirmed #69 closed,
#91 has no native blockers, and #145/#146 are native sub-issues of #54. No remaining
obsolete backend-provider references were found in the fetched issue titles or
bodies. Local documentation whitespace and relative links were checked.

## Autonomous acceptance milestone

[#147](https://github.com/DAmesberger/qdesigner-modern/issues/147) is a native
sub-issue of #54, with #91 and #51 as tracked blockers. Its
[goal](end-to-end-acceptance-goal.md) bounds autonomous delivery to real designer
authoring, separate participant completion and exact persisted form/reaction
results, plus recovery, timing provenance and JavaScript rejection.

#51 now records the locally implemented per-session sync quota, transient-error
retention and durable Retry-After policy. #91 records removal, guarded load
boundaries and the static reintroduction check as locally verified. Publication
and hosted CI remain outstanding; both implementation tickets remain open.
The [acceptance report](end-to-end-acceptance-report.md) is the current source for
run counts, evidence, code identity and limits.
