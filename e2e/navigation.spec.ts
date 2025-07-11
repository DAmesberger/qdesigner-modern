import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  // Mock authentication for all navigation tests
  test.use({
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://localhost:5173',
        localStorage: [{
          name: 'supabase.auth.token',
          value: JSON.stringify({
            access_token: 'mock-token',
            refresh_token: 'mock-refresh',
            user: {
              id: 'test-user-id',
              email: 'test@example.com'
            }
          })
        }]
      }]
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/design');
  });

  test('should display sidebar navigation', async ({ page }) => {
    // Desktop sidebar should be visible
    await expect(page.locator('.lg\\:fixed nav')).toBeVisible();
    
    // Check navigation items
    await expect(page.locator('a:has-text("Designer")')).toBeVisible();
    await expect(page.locator('a:has-text("Questionnaires")')).toBeVisible();
    await expect(page.locator('a:has-text("Analytics")')).toBeVisible();
    await expect(page.locator('a:has-text("Settings")')).toBeVisible();
  });

  test('should highlight active navigation item', async ({ page }) => {
    // Designer should be active
    const designerLink = page.locator('a:has-text("Designer")');
    await expect(designerLink).toHaveClass(/bg-gray-50 text-indigo-600/);
  });

  test('should navigate between sections', async ({ page }) => {
    // Navigate to Settings
    await page.click('a:has-text("Settings")');
    await expect(page).toHaveURL('/settings');
    
    // Settings should now be active
    const settingsLink = page.locator('a:has-text("Settings")');
    await expect(settingsLink).toHaveClass(/bg-gray-50 text-indigo-600/);
    
    // Navigate back to Designer
    await page.click('a:has-text("Designer")');
    await expect(page).toHaveURL('/design');
  });

  test.describe('Mobile Navigation', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should show mobile menu button', async ({ page }) => {
      // Hamburger menu should be visible
      await expect(page.locator('button[aria-label="Open sidebar"]')).toBeVisible();
      
      // Desktop sidebar should be hidden
      await expect(page.locator('.lg\\:fixed')).not.toBeVisible();
    });

    test('should open mobile sidebar', async ({ page }) => {
      // Click hamburger menu
      await page.click('button:has(svg[stroke-linecap="round"])');
      
      // Mobile sidebar should slide in
      await expect(page.locator('.fixed.inset-y-0.left-0.z-50.w-72')).toBeVisible();
      
      // Check navigation items in mobile menu
      await expect(page.locator('.fixed.inset-y-0 a:has-text("Designer")')).toBeVisible();
      await expect(page.locator('.fixed.inset-y-0 a:has-text("Questionnaires")')).toBeVisible();
    });

    test('should close mobile sidebar on backdrop click', async ({ page }) => {
      // Open sidebar
      await page.click('button:has(svg[stroke-linecap="round"])');
      
      // Click backdrop
      await page.click('.bg-gray-900\\/80');
      
      // Sidebar should be hidden
      await expect(page.locator('.fixed.inset-y-0.left-0.z-50.w-72')).not.toBeVisible();
    });

    test('should close mobile sidebar on navigation', async ({ page }) => {
      // Open sidebar
      await page.click('button:has(svg[stroke-linecap="round"])');
      
      // Navigate to settings
      await page.click('.fixed.inset-y-0 a:has-text("Settings")');
      
      // Should navigate and close sidebar
      await expect(page).toHaveURL('/settings');
      await expect(page.locator('.fixed.inset-y-0.left-0.z-50.w-72')).not.toBeVisible();
    });
  });

  test.describe('User Menu', () => {
    test('should display user email', async ({ page }) => {
      // Check user email is displayed
      await expect(page.locator('.user-menu')).toContainText('test@example.com');
    });

    test('should open user dropdown menu', async ({ page }) => {
      // Click user avatar
      await page.click('.user-menu button');
      
      // Dropdown should be visible
      const dropdown = page.locator('.absolute.right-0.z-10.mt-2.w-48');
      await expect(dropdown).toBeVisible();
      
      // Check menu items
      await expect(dropdown.locator('a:has-text("Your Profile")')).toBeVisible();
      await expect(dropdown.locator('a:has-text("Settings")')).toBeVisible();
      await expect(dropdown.locator('button:has-text("Sign out")')).toBeVisible();
    });

    test('should close dropdown when clicking outside', async ({ page }) => {
      // Open dropdown
      await page.click('.user-menu button');
      await expect(page.locator('.absolute.right-0.z-10.mt-2.w-48')).toBeVisible();
      
      // Click outside
      await page.click('body');
      
      // Dropdown should be hidden
      await expect(page.locator('.absolute.right-0.z-10.mt-2.w-48')).not.toBeVisible();
    });

    test('should navigate to profile from dropdown', async ({ page }) => {
      // Open dropdown
      await page.click('.user-menu button');
      
      // Click Your Profile
      await page.click('a:has-text("Your Profile")');
      
      // Should navigate to settings
      await expect(page).toHaveURL('/settings');
    });
  });

  test.describe('Notifications', () => {
    test('should display notification button', async ({ page }) => {
      // Notification bell should be visible
      await expect(page.locator('button[aria-label="View notifications"]')).toBeVisible();
    });
  });
});