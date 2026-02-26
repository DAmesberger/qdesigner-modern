# Visual Regression Workflow

## Scope
- Project questionnaire create modal
- Designer shell, flow modal, and properties panel
- Fillout welcome/runtime/completion screens

These screenshots are covered by `@visual` tests in:
- `e2e/regression/designer-fillout.visual.regression.spec.ts`

## Commands
- Run visual checks:
  - `pnpm test:e2e:visual`
- Update baselines intentionally:
  - `pnpm test:e2e:visual:update`

## Baseline policy
- Snapshot updates must be reviewed in PRs.
- If a UI change is intentional, update snapshots in the same PR.
- If a diff is unexpected, fix the UI/test determinism before updating baselines.

## Determinism notes
- Visual project locks Chromium viewport to `1440x900`.
- Tests disable animations and caret blinking before capture.
- Screenshot assertions target stable containers and mask highly variable fields.
