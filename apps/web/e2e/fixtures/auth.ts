import { Page } from '@playwright/test';
import { DEV_URLS } from '../helpers/dev-urls';

/**
 * Set up mock cookie/session authentication for tests that need it inline.
 * For most tests, prefer using the storageState from auth.setup.ts instead.
 */
export async function mockAuth(page: Page, email = 'test@example.com') {
  await page.context().addCookies([
    {
      name: 'qd_session',
      value: 'mock-session',
      url: DEV_URLS.backend,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/auth/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        provider: 'local',
        user: {
          id: 'mock-user-id',
          email,
          full_name: 'Mock User',
          roles: ['member'],
        },
        mfa_verified: true,
        roles: ['member'],
        organizations: [],
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        csrf_token: 'mock-csrf-token',
      }),
    });
  });
}

export async function clearAuth(page: Page) {
  await page.context().clearCookies();
}
