# Safe QDef authoring delivery

Defined 2026-09-13. Working horizon: approximately 12 hours of autonomous work.
Completion is based on the outcomes below, not elapsed time or the first passing
slice. The source baseline is `fa04f747a50faf85f3c3552319558ee87f4cc42d`
([PR #148](https://github.com/DAmesberger/qdesigner-modern/pull/148)); this batch
starts on `work/qdef-authoring-delivery` and preserves unrelated working changes.

## Outcome and authority

A researcher can exchange a portable Questionnaire Definition, safely create or
replace a draft, make atomic edits addressed by stable IDs, and reproduce the
recognized form/reaction configuration and behavioral model. Imported studies
remain editable, publish through the existing separate action, and produce exact
participant results through the production runtime.

The full acceptance criteria in #77–#83, the foundation specification #75,
[the successor requirements](questionnaire-definition-mcp-requirements.md), and
[ADR 0039](decisions/0039-safe-logic-only-and-qdef-boundary.md) are binding. The
existing text-only tracer is a starting point, not completion of this goal.

## Milestones

1. **#77:** all QDef ingestion paths reject executable content with stable,
   actionable paths before persistence; unsafe and failed requests make no writes.
2. **#78:** project-authorized, atomic, idempotent draft creation; canonical digest,
   installation identity, revision, projections and audit agree after retries.
3. **#79:** expected-revision replacement, prior-version snapshots and deterministic
   collaboration reconciliation; stale clients cannot restore the old definition.
4. **#80:** atomic stable-ID edit batches and bounded semantic diffs, including
   order/reference changes, stale revisions, missing IDs and retries.
5. **#81:** server-usable metadata and Config validity for every registered form,
   instruction and display module; complete recognized configuration round trips.
6. **#82:** equivalent reaction module/paradigm configuration, TimingSpecs,
   ResponseSets, Bindings and ValidityPolicy; no runtime trial sampling is introduced.
7. **#83:** portable structure, flow, variables, scoring, reports, translations and
   settings; reference/type/cycle diagnostics and installation-state exclusion.

Follow native dependencies; do not close a milestone on a partial demonstration.
Maintain an explicit inventory of recognized fields/modules and evidence, so
lossy normalization or an unsupported module cannot hide behind one happy path.

## Verification and publication

Use the already specified public seams: `QuestionnaireDefinition.read/apply`,
authenticated HTTP adapters, and real designer/participant browser journeys.
Follow failing regression → implementation cycles using real isolated database
and collaboration services where transaction behavior is part of acceptance.

Browser verification covers author/export/import/reload/publish/complete for forms
and reaction studies, plus unsafe input, retries, failed writes and two-client
conflicts. Assert exact stored answers/trials, version association and timing
provenance. Keep the existing 20-scenario acceptance gate green; extend it with
the new journeys. Synthetic timing evidence does not certify physical hardware.

Publish coherent reviewed commits/PRs, applicable source and integration checks,
passing hosted CI, and reproducible reports/traces tied to the tested revisions.
Update tickets with evidence and close only satisfied criteria. Merge of PR #148
or this batch is a separate repository action, not an assumed prerequisite.

Safe Logic is the only hook language. Unsupported Safe Logic outcomes remain
visible work; authored JavaScript never becomes a compatibility path. PCA and all
other binding requirements remain required. Full MCP transport, asset packaging,
hardware qualification and later foundation tickets retain their own criteria.
Ask for unresolved product decisions while continuing independent implementation.
