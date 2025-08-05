import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('Offline Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to designer
    await loginTestUser(page);
    await page.goto('/projects/test-project/designer');
    await page.waitForLoadState('networkidle');
  });

  test('should register service worker', async ({ page }) => {
    // Check service worker is registered
    const hasServiceWorker = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });
    expect(hasServiceWorker).toBeTruthy();

    // Wait for service worker to be ready
    const swReady = await page.evaluate(() => {
      return navigator.serviceWorker.ready.then(() => true).catch(() => false);
    });
    expect(swReady).toBeTruthy();

    // Check service worker state
    const swState = await page.evaluate(() => {
      return navigator.serviceWorker.ready.then(reg => {
        return reg.active?.state;
      });
    });
    expect(swState).toBe('activated');
  });

  test('should cache essential resources', async ({ page }) => {
    // Get cached resources
    const cachedUrls = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const allUrls: string[] = [];
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        allUrls.push(...requests.map(req => req.url));
      }
      
      return allUrls;
    });

    // Check essential resources are cached
    expect(cachedUrls.some(url => url.includes('/'))).toBeTruthy(); // App shell
    expect(cachedUrls.some(url => url.includes('.js'))).toBeTruthy(); // JavaScript
    expect(cachedUrls.some(url => url.includes('.css'))).toBeTruthy(); // Styles
    expect(cachedUrls.some(url => url.includes('/modules/'))).toBeTruthy(); // Modules
  });

  test('should work offline - create and edit questionnaire', async ({ page, context }) => {
    // Create a questionnaire while online
    await page.click('button:has-text("New Questionnaire")');
    await page.fill('input[name="title"]', 'Offline Test Questionnaire');
    await page.click('button:has-text("Create")');
    
    // Add a question
    await page.click('text=Questions');
    await page.click('text=Text Input');
    await page.fill('input[placeholder="Question text"]', 'What is your name?');
    
    // Go offline
    await context.setOffline(true);
    
    // Should show offline indicator
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Should still be able to add more questions
    await page.click('text=Multiple Choice');
    await expect(page.locator('[data-question-type="multiple-choice"]')).toBeVisible();
    
    // Configure the question
    await page.fill('input[placeholder="Question text"]', 'Select your favorite color');
    await page.fill('input[placeholder="Option 1"]', 'Red');
    await page.fill('input[placeholder="Option 2"]', 'Blue');
    await page.fill('input[placeholder="Option 3"]', 'Green');
    
    // Changes should be saved locally
    const localData = await page.evaluate(() => {
      return localStorage.getItem('questionnaire_draft');
    });
    expect(localData).toBeTruthy();
    expect(JSON.parse(localData!)).toHaveProperty('questions');
    
    // Go back online
    await context.setOffline(false);
    
    // Should sync changes
    await expect(page.locator('[data-testid="sync-indicator"]')).toBeVisible();
    await page.waitForSelector('[data-testid="sync-complete"]', { timeout: 10000 });
  });

  test('should handle offline module loading', async ({ page, context }) => {
    // Pre-cache modules while online
    await page.click('text=Questions');
    await page.waitForTimeout(1000); // Let modules load
    
    // Go offline
    await context.setOffline(true);
    
    // Try to load a new module type
    await page.click('text=Instructions');
    await page.click('text=Media Block');
    
    // Module should load from cache
    await expect(page.locator('[data-module-type="media-block"]')).toBeVisible();
    
    // Should be able to configure
    await page.click('button:has-text("Upload Image")');
    await expect(page.locator('text=Offline mode: Upload will sync when online')).toBeVisible();
  });

  test('should queue API calls when offline', async ({ page, context }) => {
    // Monitor API calls
    const apiCalls: string[] = [];
    await page.route('**/api/**', route => {
      apiCalls.push(route.request().url());
      route.continue();
    });
    
    // Go offline
    await context.setOffline(true);
    
    // Make changes that would normally trigger API calls
    await page.click('text=Questions');
    await page.click('text=Scale Question');
    await page.fill('input[placeholder="Question text"]', 'Rate this feature');
    
    // API calls should be queued
    const queuedCalls = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('offline_queue') || '[]');
    });
    expect(queuedCalls.length).toBeGreaterThan(0);
    
    // Go back online
    await context.setOffline(false);
    
    // Wait for sync
    await page.waitForTimeout(2000);
    
    // Queue should be processed
    const remainingQueue = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('offline_queue') || '[]');
    });
    expect(remainingQueue.length).toBe(0);
  });

  test('should handle offline preview mode', async ({ page, context }) => {
    // Create questionnaire with multiple questions
    await page.click('text=Questions');
    await page.click('text=Text Input');
    await page.fill('input[placeholder="Question text"]', 'Your name?');
    
    await page.click('text=Scale Question');
    await page.fill('input[placeholder="Question text"]', 'Rate our service');
    
    // Go offline
    await context.setOffline(true);
    
    // Switch to preview mode
    await page.click('button:has-text("Preview")');
    
    // Should be able to navigate through questions
    await expect(page.locator('text=Your name?')).toBeVisible();
    await page.fill('input[type="text"]', 'Test User');
    await page.click('button:has-text("Next")');
    
    await expect(page.locator('text=Rate our service')).toBeVisible();
    await page.click('[data-scale-value="4"]');
    await page.click('button:has-text("Next")');
    
    // Responses should be saved locally
    const responses = await page.evaluate(() => {
      return JSON.parse(sessionStorage.getItem('preview_responses') || '{}');
    });
    expect(responses).toHaveProperty('text_input_1', 'Test User');
    expect(responses).toHaveProperty('scale_1', 4);
  });

  test('should handle conflict resolution when syncing', async ({ page, context }) => {
    // Create questionnaire
    const questionnaireId = 'test-123';
    
    // Make change while online
    await page.click('text=Questions');
    await page.click('text=Text Input');
    await page.fill('input[placeholder="Question text"]', 'Original question');
    
    // Simulate another client making changes
    await page.evaluate((id) => {
      // Simulate server state being different
      window.localStorage.setItem(`server_state_${id}`, JSON.stringify({
        version: 2,
        questions: [{ text: 'Server version question' }]
      }));
    }, questionnaireId);
    
    // Go offline and make local changes
    await context.setOffline(true);
    await page.fill('input[placeholder="Question text"]', 'Local offline change');
    
    // Go back online
    await context.setOffline(false);
    
    // Should detect conflict
    await expect(page.locator('[data-testid="conflict-dialog"]')).toBeVisible();
    
    // Should show both versions
    await expect(page.locator('text=Server version question')).toBeVisible();
    await expect(page.locator('text=Local offline change')).toBeVisible();
    
    // User can choose which version to keep
    await page.click('button:has-text("Keep Local")');
    await expect(page.locator('[data-testid="conflict-resolved"]')).toBeVisible();
  });

  test('should persist offline state across sessions', async ({ page, context, browser }) => {
    // Make changes while offline
    await context.setOffline(true);
    await page.click('text=Questions');
    await page.click('text=Text Input');
    await page.fill('input[placeholder="Question text"]', 'Offline question');
    
    // Close and reopen browser
    await page.close();
    await context.close();
    
    // Create new context and page
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    
    // Still offline
    await newContext.setOffline(true);
    
    // Login and navigate
    await loginTestUser(newPage);
    await newPage.goto('/projects/test-project/designer');
    
    // Should restore offline changes
    await expect(newPage.locator('text=Offline question')).toBeVisible();
    await expect(newPage.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Cleanup
    await newPage.close();
    await newContext.close();
  });
});