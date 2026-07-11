import { test as base, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { DEV_URLS } from '../helpers/dev-urls';
import { provisionWorkspace, type ProvisionedWorkspace } from '../helpers/fullstack-api';

/**
 * One workspace per worker. Registering a fresh user per test trips the auth
 * limiter (10 requests / 60 s per IP), so every reaction study is created under a
 * single shared workspace; the register call is retried once through the window if
 * an earlier run already spent the budget. Studies are still isolated (each spec
 * publishes its own questionnaire under this workspace).
 */
async function provisionWithRetry(request: APIRequestContext): Promise<ProvisionedWorkspace> {
  try {
    return await provisionWorkspace(request, { emailPrefix: 'rt6' });
  } catch (error) {
    if (!String(error).includes('429')) throw error;
    // Wait out the 60 s auth window once, then retry.
    await new Promise((resolve) => setTimeout(resolve, 61000));
    return provisionWorkspace(request, { emailPrefix: 'rt6' });
  }
}

export const test = base.extend<Record<string, never>, { workspace: ProvisionedWorkspace }>({
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
