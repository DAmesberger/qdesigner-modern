# Architecture and acceptance publication — 2026-09-13

The reconciled architecture and questionnaire acceptance work are published for
review in [PR #148](https://github.com/DAmesberger/qdesigner-modern/pull/148).
The PR records the final tested revision, hosted workflow results and downloadable
artifacts. Its check results are the current CI authority; publication on a PR is
not a claim of merge or deployment to main.

## Published scope

- `9e5fdcc`: canonical text-only QDef inspection/export tracer (#76).
- `b4fe919`: requirements/audit evidence, domain vocabulary and ADR reconciliation.
  ADR 0039 requires immediate JavaScript removal; ADR 0040 retains PCA delivery.
- `f5d7421`: JavaScript removal/rejection (#91), transient sync retention and
  durable Retry-After with per-session server quotas (#51), designer editor fix.
- `5b66a46`: bounded designer-to-data acceptance (#147), recovery/security tests
  and the PR workflow. `4d9325f` normalizes imported document formatting.
- `8b04eda`: hosted infrastructure correction and revision/environment artifacts.
- `f2b7e7f`: QDef inspection/export rejects executable content and unsupported
  nonempty tracer capabilities before producing a valid canonical digest.

The [September 11 acceptance report](end-to-end-acceptance-report.md) retains the
original local results and source identity. Those results predate the publication
fixes; they are not substituted for hosted checks on the published revision.

## Standards review

Reviewed `e99379a..5b66a46` against CLAUDE.md, CONTEXT.md and applicable ADRs.
Hard documented violations: none found. The form/reaction worker fixtures repeat
workspace provisioning/disposal logic. This is one minor, nonblocking duplication
heuristic inherited from the previous fixtures, not a documented-standard breach.

## Specification review

One P1 finding: the QDef tracer accepted arbitrary JavaScript-bearing rules and
active HTML as valid during dry-run inspection. Requirements explicitly reject
executable JavaScript and require path-addressed diagnostics. The failure was
reproduced through the Definition Interface before the fix.

Commit `f2b7e7f` checks raw inspection and stored export content before normalization.
HTML is tokenized rather than matched as raw strings; active markup and executable
fields are rejected without rewriting content. The text-only tracer accepts passive
markup and rejects unsupported nonempty assets/variables/rules/flow/translations/
extensions. Full schema/alias, Safe Logic and package coverage remains #77 onward.

Follow-up review confirmed the reported P1 closed. All 11 Definition contract tests
pass locally, covering the original payloads, entity-escaped URLs, mixed-case tags,
stored-content rejection, passive text preservation and canonical round-trip equality.

Review totals: Standards — 0 hard violations, 1 minor heuristic; Spec — 1 P1 found,
fixed and reviewed, 0 unresolved findings in the bounded publication scope.

## Hosted evidence and reproduction

The initial hosted frontend and generated-contract jobs passed. Both backend and
acceptance jobs failed before application tests because Docker Hub refused the
MinIO image pulls. The release images were verified and pulled from Quay; the
server digest matches the previously tested local image. The failed runs remain
visible in the PR history. Gates were not weakened to hide these failures.

The acceptance workflow retains the checked-out revision (GitHub's PR merge
revision), tool/browser versions, service images, all Playwright traces, HTML report,
console output, and backend/infrastructure logs for 14 days. The PR evidence also
identifies the source branch head. Record both when reproducing a PR run.

To reproduce, check out the source head linked in the PR evidence, follow
[the isolated-stack setup](../apps/web/e2e/README.md), and run:

```sh
pnpm test:e2e:acceptance --reporter=line,html
SQLX_OFFLINE=true cargo test --manifest-path apps/server/Cargo.toml --test questionnaire_definition_contract
```

The first command fixes one worker, zero retries and tracing. Source gates remain
in `ci.yml`; live acceptance runs in `e2e-acceptance.yml`. Physical display/input
qualification, PCA, full Safe Logic/QDef/MCP and broader parity are separate work.
