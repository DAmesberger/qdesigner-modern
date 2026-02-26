import { test as setup, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

const testUsers = [
  { role: 'admin', email: 'admin@test.local', password: 'TestPassword123!', storageState: '.auth/admin.json' },
  { role: 'editor', email: 'editor@test.local', password: 'TestPassword123!', storageState: '.auth/editor.json' },
  { role: 'viewer', email: 'viewer@test.local', password: 'TestPassword123!', storageState: '.auth/viewer.json' },
];

for (const user of testUsers) {
  setup(`authenticate as ${user.role}`, async ({ page }) => {
    // Navigate to login
    await page.goto(`${BASE_URL}/login`);

    // Fill in credentials
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', user.password);

    // Submit login form
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard or onboarding
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 });

    // Save storage state (includes localStorage with JWT tokens)
    await page.context().storageState({ path: user.storageState });

    console.log(`Saved auth state for ${user.role} to ${user.storageState}`);
  });
}
