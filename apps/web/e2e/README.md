# E2E Tests

Playwright provides these lanes:

- `@smoke`: small authenticated designer smoke test (Chromium)
- `@regression`: broader designer/runtime coverage (Chromium/Firefox/WebKit)
- `@fullstack`: real backend creation + publish + participant fillout (Chromium)
- `@reaction`: production WebGL input, persisted trials, offline recovery, media and timing validity
- `@form`: online answers, validation, binary capture, resume and sync retry

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
pnpm test:e2e                 # smoke lane
pnpm test:e2e:acceptance      # bounded live-stack Chromium PR gate, retries disabled
pnpm test:e2e:smoke           # same as above
pnpm test:e2e:regression      # regression on Chromium
pnpm test:e2e:fullstack       # fullstack on Chromium
pnpm test:e2e:regression:all  # regression on Chromium + Firefox + WebKit
pnpm test:e2e:all             # all configured projects
```

## Acceptance gate and startup

The bounded acceptance command runs UI-authored form and Standard RT journeys,
exact persisted results, recovery/deduplication, concurrent participants,
Retry-After, JavaScript rejection and the form/reaction suites. It provisions
synthetic studies through the real API, with separate author/participant contexts.
Ordinary forms stay online. There are no inter-test rate-window delays.

[The PR workflow](../../../.github/workflows/e2e-acceptance.yml) is the reproducible
startup recipe: dedicated test Compose services, migration/user database
connections, Rust server on 4100, Vite on 4173, Chromium and frontend code
generation. For a local run, use those test environment values and start the same
services/server, then run `pnpm test:e2e:acceptance` from the repository root.
Playwright starts Vite if needed. Keep `VITE_API_URL` empty to use the same-origin
proxy required by CSP. Do not regenerate Paraglide or build while browser tests
are using the Vite server.

The PR job retains traces, failure screenshots/video, the HTML report, console
output and server/infrastructure logs for 14 days. The broader on-demand workflow
is separate. [The acceptance report](../../../docs/end-to-end-acceptance-report.md)
records actual local/hosted evidence and limitations. Browser input tests do not
certify physical reaction-time accuracy.

For ordinary online Firefox/WebKit checks:

```bash
pnpm --filter @qdesigner/web exec playwright test e2e/form/capture-smoke.form.spec.ts e2e/form/validation.form.spec.ts --project=form-firefox --project=form-webkit --workers=1 --retries=0
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
- `designer-empty-state`
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
