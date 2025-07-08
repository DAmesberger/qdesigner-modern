import { test, expect } from '@playwright/test';

test.describe('Reaction Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the home page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('QDesigner Modern');
    await expect(page.locator('text=High-performance questionnaire platform')).toBeVisible();
  });

  test('should start reaction test', async ({ page }) => {
    // Click start test button
    await page.click('button:has-text("Start Test")');

    // Should show instructions
    await expect(page.locator('h2:has-text("Reaction Time Test")')).toBeVisible();
    await expect(page.locator('text=SPACEBAR')).toBeVisible();

    // Start the test
    await page.click('button:has-text("Start Test")');

    // Test should be running
    await expect(page.locator('text=Test in progress')).toBeVisible();
  });

  test('should require WebGL 2.0', async ({ page }) => {
    // Override WebGL context to return null
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function(contextType: string) {
        if (contextType === 'webgl2') {
          return null;
        }
        return null;
      };
    });

    await page.goto('/');
    await page.click('button:has-text("Start Test")');
    await page.click('button:has-text("Start Test")');

    // Should show error in console
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(1000);
    
    const webglError = consoleErrors.find(error => 
      error.includes('WebGL 2.0 is required')
    );
    expect(webglError).toBeDefined();
  });
});