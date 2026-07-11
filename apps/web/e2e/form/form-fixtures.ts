import { test as base, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { DEV_URLS } from '../helpers/dev-urls';
import { provisionWorkspace, type ProvisionedWorkspace } from '../helpers/fullstack-api';

/**
 * One workspace per worker (mirrors reaction-fixtures). Registering a fresh user per test
 * trips the auth limiter (10 requests / 60 s per IP), so every @form study is created under
 * a single shared workspace; the register call is retried once through the window if an
 * earlier run already spent the budget. Studies stay isolated — each spec publishes its own
 * questionnaire under this workspace.
 */
async function provisionWithRetry(request: APIRequestContext): Promise<ProvisionedWorkspace> {
  try {
    return await provisionWorkspace(request, { emailPrefix: 'form' });
  } catch (error) {
    if (!String(error).includes('429')) throw error;
    // Wait out the 60 s auth window once, then retry.
    await new Promise((resolve) => setTimeout(resolve, 61000));
    return provisionWorkspace(request, { emailPrefix: 'form' });
  }
}

/** Shared worker state so the rate gate can space consecutive tests. */
interface RateGateState {
  lastFinishedAt: number;
}

/**
 * Anonymous fillout syncs share ONE `/sync` rate bucket per IP (10 requests / 60 s — the
 * key falls back to the peer IP when there's no authenticated user). Each @form study
 * completes on the offline-first path and drains in ~1–2 batched `/sync` POSTs on reconnect,
 * but several fast studies back-to-back can still cluster past the budget and dead-letter a
 * later study's answers. The gate keeps consecutive tests ≥ RATE_GATE_MS apart so each runs
 * in a fresh window — the deterministic equivalent of the @reaction lane's naturally slower,
 * lower-sync specs. (The per-IP `/sync` limit dead-lettering answers for normal-paced,
 * normal-length participation is itself a product concern, reported alongside this lane.)
 *
 * The gate only helps when specs run SEQUENTIALLY. Playwright's local default is
 * `fullyParallel` with one worker per core, and parallel workers share the same per-IP
 * `/sync` (and auth) limiter budget — so they burst past it and dead-letter regardless of
 * the gate (issue #51). The `test:e2e:form` script therefore pins `--workers=1`; keep it
 * pinned until #51 raises/rescopes the limiter. (CI is already serial: playwright.config.ts
 * sets `workers: isCI ? 1 : undefined`.)
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
    { auto: true },
  ],

  workspace: [
    // eslint-disable-next-line no-empty-pattern -- Playwright worker fixtures with no deps
    async ({}, use) => {
      const request = await playwrightRequest.newContext({ baseURL: DEV_URLS.frontend });
      try {
        const workspace = await provisionWithRetry(request);
        await use(workspace);
      } finally {
        await request.dispose();
      }
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
