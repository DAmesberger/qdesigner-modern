import { test as base, request as playwrightRequest } from '@playwright/test';
import { DEV_URLS } from '../helpers/dev-urls';
import { provisionWorkspace, type ProvisionedWorkspace } from '../helpers/fullstack-api';

/** Real auth/org/project setup once per worker; each study remains isolated.
 * #51 gives sync its own per-session quota. There is no inter-test rate-window
 * delay or offline-only workaround for ordinary online participation.
 */
export const test = base.extend<object, { workspace: ProvisionedWorkspace }>({
  workspace: [
    // eslint-disable-next-line no-empty-pattern -- worker fixture with no dependencies
    async ({}, use) => {
      const request = await playwrightRequest.newContext({ baseURL: DEV_URLS.frontend });
      try {
        await use(await provisionWorkspace(request, { emailPrefix: 'rt6' }));
      } finally {
        await request.dispose();
      }
    },
    // Provisioning may retry an exhausted auth budget; sync has a separate quota.
    { scope: 'worker', timeout: 120000 },
  ],
});

export { expect } from '@playwright/test';
