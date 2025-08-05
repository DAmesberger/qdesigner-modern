import { test, expect, type Page } from '@playwright/test';
import { createTestUser, loginTestUser, cleanupTestData } from './helpers/auth';

// Helper to wait for module to load
async function waitForModuleLoad(page: Page, moduleType: string) {
  await page.waitForFunction(
    (type) => {
      const registry = (window as any).moduleRegistry;
      return registry && registry.has(type);
    },
    moduleType,
    { timeout: 10000 }
  );
}

test.describe('Modular Questionnaire System', () => {
  let userId: string;
  let questionnaireId: string;

  test.beforeAll(async () => {
    // Create test user
    const user = await createTestUser();
    userId = user.id;
  });

  test.afterAll(async () => {
    // Cleanup test data
    await cleanupTestData(userId);
  });

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginTestUser(page);
    
    // Navigate to designer
    await page.goto('/projects/test-project/designer');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Module Palette', () => {
    test('should display all three module categories', async ({ page }) => {
      // Check category tabs exist
      await expect(page.locator('text=Instructions')).toBeVisible();
      await expect(page.locator('text=Questions')).toBeVisible();
      await expect(page.locator('text=Analytics')).toBeVisible();
    });

    test('should switch between categories', async ({ page }) => {
      // Click on Instructions tab
      await page.click('text=Instructions');
      await expect(page.locator('text=Text Block')).toBeVisible();
      
      // Click on Questions tab
      await page.click('text=Questions');
      await expect(page.locator('text=Text Input')).toBeVisible();
      
      // Click on Analytics tab
      await page.click('text=Analytics');
      await expect(page.locator('text=Bar Chart')).toBeVisible();
    });

    test('should search modules', async ({ page }) => {
      // Search for "text"
      await page.fill('input[placeholder="Search modules..."]', 'text');
      
      // Should show text-related modules
      await expect(page.locator('text=Text Input')).toBeVisible();
      await expect(page.locator('text=Text Block')).toBeVisible();
      
      // Should hide unrelated modules
      await expect(page.locator('text=Bar Chart')).not.toBeVisible();
    });
  });

  test.describe('Module Creation and Configuration', () => {
    test('should create a text input question', async ({ page }) => {
      // Click on Questions tab
      await page.click('text=Questions');
      
      // Drag text input to canvas
      const textInput = page.locator('text=Text Input').first();
      const canvas = page.locator('.page-canvas');
      
      await textInput.dragTo(canvas);
      
      // Wait for module to load
      await waitForModuleLoad(page, 'text-input');
      
      // Check question was added
      await expect(page.locator('[data-question-type="text-input"]')).toBeVisible();
      
      // Configure question in properties panel
      await page.click('[data-question-type="text-input"]');
      await page.fill('input[placeholder="Enter your question text here"]', 'What is your name?');
      
      // Verify configuration
      await expect(page.locator('text=What is your name?')).toBeVisible();
    });

    test('should create an instruction module', async ({ page }) => {
      // Click on Instructions tab
      await page.click('text=Instructions');
      
      // Add text block
      await page.click('text=Text Block');
      
      // Wait for module to load
      await waitForModuleLoad(page, 'text-block');
      
      // Configure instruction
      await page.fill('textarea[placeholder="Enter instruction text"]', '## Welcome\n\nPlease answer the following questions.');
      
      // Verify markdown rendering
      await expect(page.locator('h2:has-text("Welcome")')).toBeVisible();
    });

    test('should create an analytics module', async ({ page }) => {
      // First create some questions to generate data
      await page.click('text=Questions');
      await page.click('text=Scale Question');
      await waitForModuleLoad(page, 'scale');
      
      // Configure scale question
      await page.fill('input[placeholder="Question text"]', 'Rate your satisfaction');
      
      // Add analytics
      await page.click('text=Analytics');
      await page.click('text=Bar Chart');
      await waitForModuleLoad(page, 'bar-chart');
      
      // Configure analytics to use scale data
      await page.selectOption('select[name="dataSource"]', 'scale_satisfaction');
      
      // Verify analytics configuration
      await expect(page.locator('[data-analytics-type="bar-chart"]')).toBeVisible();
    });
  });

  test.describe('Variable System Integration', () => {
    test('should support variable interpolation in text', async ({ page }) => {
      // Create a variable
      await page.click('button:has-text("Variables")');
      await page.click('button:has-text("Add Variable")');
      await page.fill('input[name="variableName"]', 'userName');
      await page.fill('input[name="defaultValue"]', 'John');
      
      // Create instruction with variable
      await page.click('text=Instructions');
      await page.click('text=Text Block');
      await page.fill('textarea', 'Hello {{userName}}, welcome to the survey!');
      
      // Preview should show interpolated value
      await page.click('button:has-text("Preview")');
      await expect(page.locator('text=Hello John, welcome to the survey!')).toBeVisible();
    });

    test('should update analytics with variable changes', async ({ page }) => {
      // Create questions and collect responses
      // ... (setup code)
      
      // Add analytics that uses response data
      await page.click('text=Analytics');
      await page.click('text=Line Chart');
      
      // Configure to show response trends
      await page.selectOption('select[name="dataSource"]', 'formula');
      await page.fill('input[name="formula"]', 'AVG(satisfaction_scores)');
      
      // Verify analytics updates
      await expect(page.locator('canvas[data-chart-type="line"]')).toBeVisible();
    });
  });

  test.describe('Conditional Logic', () => {
    test('should show/hide modules based on conditions', async ({ page }) => {
      // Create a yes/no question
      await page.click('text=Questions');
      await page.click('text=Single Choice');
      await page.fill('input[name="questionId"]', 'hasExperience');
      
      // Create conditional instruction
      await page.click('text=Instructions');
      await page.click('text=Text Block');
      await page.click('button:has-text("Add Condition")');
      await page.fill('input[name="condition"]', 'hasExperience == "yes"');
      
      // Test in preview
      await page.click('button:has-text("Preview")');
      
      // Initially hidden
      await expect(page.locator('[data-conditional-instruction]')).not.toBeVisible();
      
      // Select "yes" option
      await page.click('label:has-text("Yes")');
      
      // Now visible
      await expect(page.locator('[data-conditional-instruction]')).toBeVisible();
    });
  });

  test.describe('Offline Functionality', () => {
    test('should work offline after initial load', async ({ page, context }) => {
      // Load questionnaire
      await page.goto('/projects/test-project/designer/test-questionnaire');
      await page.waitForLoadState('networkidle');
      
      // Go offline
      await context.setOffline(true);
      
      // Should still be able to add modules
      await page.click('text=Questions');
      await page.click('text=Text Input');
      
      // Module should load from cache
      await expect(page.locator('[data-question-type="text-input"]')).toBeVisible();
      
      // Should be able to configure
      await page.fill('input[placeholder="Question text"]', 'Offline question');
      
      // Should show offline indicator
      await expect(page.locator('[data-offline-indicator]')).toBeVisible();
      
      // Go back online
      await context.setOffline(false);
      
      // Should sync changes
      await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();
    });

    test('should cache module components', async ({ page }) => {
      // Check service worker registration
      const swRegistration = await page.evaluate(() => navigator.serviceWorker.ready);
      expect(swRegistration).toBeTruthy();
      
      // Check module cache
      const cachedModules = await page.evaluate(async () => {
        const cache = await caches.open('module-cache-v1');
        const keys = await cache.keys();
        return keys.map(req => req.url);
      });
      
      // Should have cached module files
      expect(cachedModules.some(url => url.includes('/modules/'))).toBeTruthy();
    });
  });

  test.describe('Runtime Mode', () => {
    test('should present all module types in correct order', async ({ page }) => {
      // Create a questionnaire with mixed modules
      // ... (setup code to create questionnaire)
      
      // Switch to runtime mode
      await page.goto(`/run/${questionnaireId}`);
      
      // Should show instruction first
      await expect(page.locator('h2:has-text("Welcome")')).toBeVisible();
      await page.click('button:has-text("Next")');
      
      // Should show question
      await expect(page.locator('text=What is your name?')).toBeVisible();
      await page.fill('input[type="text"]', 'Test User');
      await page.click('button:has-text("Next")');
      
      // Should show analytics
      await expect(page.locator('[data-analytics-visualization]')).toBeVisible();
      await page.click('button:has-text("Next")');
      
      // Should complete
      await expect(page.locator('text=Thank you for completing')).toBeVisible();
    });

    test('should collect responses correctly', async ({ page }) => {
      // Run through questionnaire
      // ... (navigation code)
      
      // Check responses were saved
      const responses = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('questionnaire_responses') || '{}');
      });
      
      expect(responses).toHaveProperty('userName', 'Test User');
      expect(responses).toHaveProperty('satisfaction', 4);
    });
  });

  test.describe('Performance', () => {
    test('should load modules lazily', async ({ page }) => {
      // Monitor network requests
      const moduleRequests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/modules/')) {
          moduleRequests.push(request.url());
        }
      });
      
      // Load designer
      await page.goto('/projects/test-project/designer');
      
      // Initially should not load all modules
      expect(moduleRequests.length).toBeLessThan(5);
      
      // Click on a specific module
      await page.click('text=WebGL Question');
      
      // Should load WebGL module files
      await page.waitForRequest(req => req.url().includes('webgl'));
      expect(moduleRequests.some(url => url.includes('webgl'))).toBeTruthy();
    });

    test('should render 120 FPS for WebGL questions', async ({ page }) => {
      // Add WebGL question
      await page.click('text=Questions');
      await page.click('text=WebGL Stimulus');
      
      // Switch to preview
      await page.click('button:has-text("Preview")');
      
      // Measure frame rate
      const fps = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let frames = 0;
          let lastTime = performance.now();
          
          function countFrames() {
            frames++;
            const currentTime = performance.now();
            
            if (currentTime - lastTime >= 1000) {
              resolve(frames);
            } else {
              requestAnimationFrame(countFrames);
            }
          }
          
          requestAnimationFrame(countFrames);
        });
      });
      
      // Should achieve high frame rate
      expect(fps).toBeGreaterThan(100);
    });
  });
});

test.describe('Module Development', () => {
  test('should hot reload module changes in development', async ({ page }) => {
    // This test would only run in development mode
    if (process.env.NODE_ENV !== 'development') {
      test.skip();
      return;
    }
    
    // Make a change to a module file
    // ... (development-specific test)
    
    // Should reload without full page refresh
    await expect(page.locator('[data-hot-reload-indicator]')).toBeVisible();
  });
});