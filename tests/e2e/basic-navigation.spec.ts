import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    
    // Should show login page or redirect
    await expect(page).toHaveURL(/\/(login|dashboard)/);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/login');
    
    // Should have login form
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with demo credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in demo credentials
    await page.fill('input[type="email"]', 'demo@example.com');
    await page.fill('input[type="password"]', 'demo123456');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should redirect after login
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    // Should show dashboard
    await expect(page.locator('h1')).toContainText(/Dashboard|Projects/);
  });

  test('should navigate to designer', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'demo@example.com');
    await page.fill('input[type="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    // Navigate to designer
    await page.goto('/projects/test-project/designer');
    
    // Should show designer components
    await expect(page.locator('text=Module Palette')).toBeVisible();
    await expect(page.locator('text=Questions')).toBeVisible();
  });
});