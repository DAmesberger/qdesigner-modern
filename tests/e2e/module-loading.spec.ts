import { test, expect } from '@playwright/test';

test.describe('Module Loading', () => {
  test('should load module registry on page load', async ({ page }) => {
    // Navigate directly to a public route (if available) or accept the redirect
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check that the page loads without errors
    expect(response?.status()).toBeLessThan(400);
    
    // Check if module registry is available in window
    const hasModuleRegistry = await page.evaluate(() => {
      return typeof (window as any).moduleRegistry !== 'undefined';
    });
    
    // Module registry should be available even on public pages
    expect(hasModuleRegistry).toBeTruthy();
  });
  
  test('should have question modules registered', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check for specific question modules
    const registeredModules = await page.evaluate(() => {
      const registry = (window as any).moduleRegistry;
      if (!registry) return [];
      
      const modules: string[] = [];
      if (registry.has) {
        // Check common question types
        const types = ['text-input', 'single-choice', 'multiple-choice', 'scale'];
        types.forEach(type => {
          if (registry.has(type)) {
            modules.push(type);
          }
        });
      }
      return modules;
    });
    
    // Should have at least some modules registered
    expect(registeredModules.length).toBeGreaterThan(0);
  });
});