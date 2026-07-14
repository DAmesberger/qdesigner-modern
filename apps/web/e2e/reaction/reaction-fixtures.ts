import { test as base, request as playwrightRequest } from '@playwright/test';
import { DEV_URLS } from '../helpers/dev-urls';
import { provisionWorkspace, type ProvisionedWorkspace } from '../helpers/fullstack-api';

/**
 * One workspace per worker. Registering a fresh user per test trips the auth
 * limiter (10 requests / 60 s per IP), so every reaction study is created under a
 * single shared workspace; the register call is retried once through the window if
 * an earlier run already spent the budget. Studies are still isolated (each spec
 * publishes its own questionnaire under this workspace).
 *
 * The `test:e2e:reaction` script pins `--workers=1`. Parallel workers share the same
 * per-IP `/sync`+auth limiter budget (the key falls back to the peer IP for anonymous
 * fillout), so running specs in parallel bursts past it and answers dead-letter (issue
 * #51) — the same exposure documented at length in e2e/form/form-fixtures.ts. Keep it
 * pinned until #51 raises/rescopes the limiter. (CI is already serial: playwright.config.ts
 * sets `workers: isCI ? 1 : undefined`.)
 */
/** Shared worker state so the rate gate can space consecutive tests. */
interface RateGateState {
  lastFinishedAt: number;
}

/**
 * Anonymous fillout syncs share ONE `/sync` bucket per IP (10 requests / 60 s — the key falls
 * back to the peer IP when there is no authenticated user), so specs running back-to-back
 * cluster past the budget and a later spec's answers dead-letter (issue #51). That is what
 * failed `offline-roundtrip` in-lane while it passes on its own: it asserted 4 synced trials
 * and got 0, because its syncs were 429'd by budget the preceding specs had already spent.
 *
 * The @form lane solved this with exactly this gate; the comment there assumed the @reaction
 * specs were "naturally slower, lower-sync" and did not need one. They are not, and they do.
 * Keeping consecutive tests ≥ RATE_GATE_MS apart gives each a fresh window.
 *
 * The gate has its own timeout so its wait is not charged against the test's 120 s budget.
 */
const RATE_GATE_MS = 45000;

export const test = base.extend<
  { rateGate: void },
  { workspace: ProvisionedWorkspace; rateGateState: RateGateState }
>({
  rateGateState: [
    // eslint-disable-next-line no-empty-pattern -- worker fixture with no deps
    async ({}, use) => {
      await use({ lastFinishedAt: 0 });
    },
    { scope: 'worker' },
  ],

  rateGate: [
    async ({ rateGateState }, use) => {
      if (rateGateState.lastFinishedAt > 0) {
        const wait = RATE_GATE_MS - (Date.now() - rateGateState.lastFinishedAt);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      await use();
      rateGateState.lastFinishedAt = Date.now();
    },
    { auto: true, timeout: 90000 },
  ],

  workspace: [
    // eslint-disable-next-line no-empty-pattern -- Playwright worker fixtures with no deps
    async ({}, use) => {
      const request = await playwrightRequest.newContext({ baseURL: DEV_URLS.frontend });
      try {
        const workspace = await provisionWorkspace(request, { emailPrefix: 'rt6' });
        await use(workspace);
      } finally {
        await request.dispose();
      }
    },
    // The 429 retry now lives in provisionWorkspace (one place, every lane). It waits out the
    // limiter's 60 s window, so this fixture MUST be allowed to outlive that wait: Playwright
    // caps fixture setup at 30 s by default, and the previous local retry — a 61 s sleep under
    // a 30 s cap — could never finish. It always died as `Fixture "workspace" timeout of
    // 30000ms exceeded`, which read like a hang but was just the budget being spent (typically
    // by the preceding lane, or by the re-provision Playwright triggers when it restarts the
    // worker after a failure). That cascade failed specs that pass fine on their own.
    { scope: 'worker', timeout: 120000 },
  ],
});

export { expect } from '@playwright/test';
