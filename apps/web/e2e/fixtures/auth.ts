import { Page } from '@playwright/test';

/**
 * Set up mock authentication state for tests that need it inline.
 * For most tests, prefer using the storageState from auth.setup.ts instead.
 */
export async function mockAuth(page: Page, email = 'test@example.com') {
  await page.addInitScript((userEmail) => {
    // Set auth token in the format the new backend expects
    window.localStorage.setItem('auth_token', JSON.stringify({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Date.now() + 3600000, // 1 hour from now
    }));
    window.localStorage.setItem('auth_user', JSON.stringify({
      id: 'mock-user-id',
      email: userEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  }, email);
}

export async function clearAuth(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('auth_token');
    window.localStorage.removeItem('auth_user');
  });
}
