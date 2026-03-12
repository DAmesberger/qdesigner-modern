import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the home page which should redirect to login
    await page.goto('/');
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    // Should be redirected to login
    await expect(page).toHaveURL('/login');

    // Check login page elements
    await expect(page.locator('h2')).toContainText('Sign in to QDesigner');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Sign in")');

    // Should show error message
    await expect(page.locator('.bg-red-50')).toBeVisible();
    await expect(page.locator('.text-red-800')).toBeVisible();
  });

  test('should navigate to forgot password', async ({ page }) => {
    await page.click('a:has-text("Forgot password?")');
    await expect(page).toHaveURL('/forgot-password');
  });

  test('should show create account button', async ({ page }) => {
    await expect(page.locator('button:has-text("Create new account")')).toBeVisible();
  });

  test.describe('Authenticated user', () => {
    // Use saved auth state from setup project
    test.use({ storageState: '.auth/admin.json' });

    test('should show user menu when authenticated', async ({ page }) => {
      await page.goto('/design');

      // Check user avatar is visible
      await expect(page.locator('.user-menu img')).toBeVisible();

      // Click user menu
      await page.click('.user-menu button');

      // Check dropdown menu items
      await expect(page.locator('a:has-text("Your Profile")')).toBeVisible();
      await expect(page.locator('a:has-text("Settings")')).toBeVisible();
      await expect(page.locator('button:has-text("Sign out")')).toBeVisible();
    });

    test('should sign out successfully', async ({ page }) => {
      await page.goto('/design');

      // Open user menu
      await page.click('.user-menu button');

      // Click sign out
      await page.click('button:has-text("Sign out")');

      // Should redirect to login
      await expect(page).toHaveURL('/login');
    });
  });
});
