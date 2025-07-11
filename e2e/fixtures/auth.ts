import { Page } from '@playwright/test';

export async function mockAuth(page: Page, email = 'test@example.com') {
  await page.addInitScript(() => {
    // Mock Supabase auth
    window.localStorage.setItem('supabase.auth.token', JSON.stringify({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Date.now() + 3600000, // 1 hour from now
      user: {
        id: 'mock-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
  });
}

export async function clearAuth(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('supabase.auth.token');
  });
}