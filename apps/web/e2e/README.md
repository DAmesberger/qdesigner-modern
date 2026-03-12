# E2E Tests

Playwright tests are split into two lanes:

- `@smoke`: fast PR gate (Chromium only)
- `@regression`: broader designer/runtime coverage (Chromium/Firefox/WebKit)
- `@fullstack`: real backend creation + publish + participant fillout (Chromium)

Legacy specs were moved to `e2e/legacy/` and are excluded from default runs.

## Structure

- `e2e/smoke/` - critical path tests
- `e2e/regression/` - deeper behavior tests
- `e2e/fullstack/` - backend-provisioned end-to-end flows
- `e2e/page-objects/` - reusable UI helpers
- `e2e/fixtures/` - deterministic test data helpers
- `e2e/setup/` - legacy auth/bootstrap setup project (not used by default lanes)
- `e2e/legacy/` - quarantined old tests

## Run

```bash
pnpm test:e2e                 # smoke lane (PR default)
pnpm test:e2e:smoke           # same as above
pnpm test:e2e:regression      # regression on Chromium
pnpm test:e2e:fullstack       # fullstack on Chromium
pnpm test:e2e:regression:all  # regression on Chromium + Firefox + WebKit
pnpm test:e2e:all             # all configured projects
```

## Selector Contract

Use `data-testid` selectors for stability. Active specs should prefer `page.getByTestId(...)` over CSS selectors.

Selector priority:

1. `getByTestId` for deterministic UI hooks.
2. `getByRole` / `getByLabel` only when asserting accessibility semantics.
3. Avoid placeholder/text/class selectors for interactions in smoke/regression/fullstack suites.

This is lint-enforced for active suites (`smoke`, `regression`, `fullstack`, `page-objects`) via:

```bash
pnpm lint:e2e:selectors
```

Core selectors used by smoke/regression include:

- `create-questionnaire-button`
- `questionnaire-name-input`
- `questionnaire-create-confirm`
- `designer-root`
- `designer-empty-add-text-question`
- `designer-preview-button`
- `designer-preview-modal`
- `preview-question-list`

## Current coverage

- Questionnaire creation from project page
- Designer question insertion
- Preview-based fillout interaction
- Command palette + responsive designer shell behavior
- Runtime flow-control, randomization, programmability, answer-option, and chart-feedback scenarios
- Fullstack questionnaire creation/publish/fillout path via real backend APIs

Default smoke/regression lanes are intentionally auth-free and use mock project route `test-project-1` for deterministic PR stability.
