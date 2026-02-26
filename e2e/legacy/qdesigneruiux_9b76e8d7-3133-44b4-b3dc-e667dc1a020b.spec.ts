
import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test('QDesignerUIUX_2025-07-29', async ({ page, context }) => {
  
    // Click element
    await page.click('a[href="/login"]');

    // Fill input field
    await page.fill('input[name="email"]', 'demo@example.com');

    // Fill input field
    await page.fill('input[name="password"]', 'demo123456');

    // Click element
    await page.click('button[type="submit"]');

    // Click element
    await page.click('a[href="/projects"]');

    // Click element
    await page.click('nav a[href="/projects"]:visible');

    // Click element
    await page.click('h3:has-text("Sample Research Project")');
});