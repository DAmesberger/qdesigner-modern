import { test, expect } from '@playwright/test';
import { 
  simulateOffline, 
  simulateOnline, 
  waitForSync, 
  clearOfflineData,
  getOfflineQueueSize,
  verifyOfflineIndicator,
  verifySyncInProgress,
  monitorSyncOperations
} from '../tests/helpers/offline';
import { createTestUser, loginUser } from './helpers/auth';

test.describe('Offline/Online Sync E2E Tests', () => {
  let testUser: any;
  
  test.beforeAll(async () => {
    // Create a test user for these tests
    testUser = await createTestUser({
      email: `offline-test-${Date.now()}@example.com`,
      password: 'OfflineTest123!'
    });
  });
  
  test.beforeEach(async ({ page }) => {
    // Clear offline data before each test
    await clearOfflineData(page);
    
    // Login test user
    await loginUser(page, testUser.email, testUser.password);
    
    // Navigate to designer
    await page.goto('/designer');
    await page.waitForSelector('[data-testid="designer-canvas"]');
  });
  
  test('should work offline and sync when reconnected', async ({ page, context }) => {
    // Monitor sync operations
    const syncMonitor = await monitorSyncOperations(page);
    
    // Create initial questionnaire while online
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Online Page');
    
    // Verify initial save
    await page.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
    
    // Go offline
    await simulateOffline(page);
    await verifyOfflineIndicator(page);
    
    // Create content while offline
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Offline Page');
    
    await page.click('[data-testid="add-block"]');
    await page.fill('[data-testid="block-title"]', 'Offline Block');
    
    await page.click('[data-testid="add-question"]');
    await page.fill('[data-testid="question-text"]', 'What is your offline experience?');
    
    // Verify offline save indicator
    await page.waitForSelector('[data-testid="save-status"]:has-text("Saved offline")');
    
    // Check sync queue size
    const queueSize = await getOfflineQueueSize(page);
    expect(queueSize).toBeGreaterThan(0);
    
    // Go back online
    await simulateOnline(page);
    
    // Verify sync in progress
    await verifySyncInProgress(page);
    
    // Wait for sync to complete
    await waitForSync(page);
    
    // Verify sync complete indicator
    await page.waitForSelector('[data-testid="save-status"]:has-text("Synced")');
    
    // Verify queue is empty
    const finalQueueSize = await getOfflineQueueSize(page);
    expect(finalQueueSize).toBe(0);
    
    // Verify data persisted by refreshing
    await page.reload();
    await page.waitForSelector('[data-testid="designer-canvas"]');
    
    // Check both pages exist
    await expect(page.locator('text=Online Page')).toBeVisible();
    await expect(page.locator('text=Offline Page')).toBeVisible();
    
    // Verify sync operations were recorded
    const syncOps = syncMonitor.getSyncOps();
    expect(syncOps.length).toBeGreaterThan(0);
    expect(syncOps.some(op => op.url.includes('/api/questionnaires'))).toBe(true);
  });
  
  test('should handle offline-first workflow', async ({ page, context }) => {
    // Start offline
    await simulateOffline(page);
    await verifyOfflineIndicator(page);
    
    // Create complete questionnaire offline
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Offline First Questionnaire');
    await page.fill('[data-testid="questionnaire-description"]', 'Created entirely offline');
    
    // Add multiple pages
    for (let i = 1; i <= 3; i++) {
      await page.click('[data-testid="add-page"]');
      await page.fill('[data-testid="page-title"]', `Page ${i}`);
      
      // Add questions to each page
      await page.click('[data-testid="add-question"]');
      await page.fill('[data-testid="question-text"]', `Question for page ${i}`);
    }
    
    // Verify auto-save worked offline
    await page.waitForSelector('[data-testid="auto-save-indicator"]');
    
    // Go online
    await simulateOnline(page);
    await waitForSync(page);
    
    // Navigate away and back
    await page.goto('/dashboard');
    await page.waitForSelector('[data-testid="questionnaire-list"]');
    
    // Verify questionnaire appears in list
    await expect(page.locator('text=Offline First Questionnaire')).toBeVisible();
    
    // Open it again
    await page.click('text=Offline First Questionnaire');
    await page.waitForSelector('[data-testid="designer-canvas"]');
    
    // Verify all content is there
    for (let i = 1; i <= 3; i++) {
      await expect(page.locator(`text=Page ${i}`)).toBeVisible();
    }
  });
  
  test('should handle conflict resolution', async ({ page, context, browser }) => {
    // Create initial questionnaire
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Conflict Test');
    await page.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
    
    // Get questionnaire ID from URL
    const url = page.url();
    const questionnaireId = url.split('/').pop();
    
    // Open in second browser (simulating another user/device)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await loginUser(page2, testUser.email, testUser.password);
    await page2.goto(`/designer/${questionnaireId}`);
    await page2.waitForSelector('[data-testid="designer-canvas"]');
    
    // Make page1 go offline
    await simulateOffline(page);
    
    // Edit in both browsers
    await page.fill('[data-testid="questionnaire-name"]', 'Conflict Test - Offline Edit');
    await page2.fill('[data-testid="questionnaire-name"]', 'Conflict Test - Online Edit');
    
    // Save in page2 (online)
    await page2.click('[data-testid="save-button"]');
    await page2.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
    
    // Bring page1 back online
    await simulateOnline(page);
    
    // Should detect conflict
    await page.waitForSelector('[data-testid="conflict-dialog"]');
    
    // Verify conflict information shown
    await expect(page.locator('text=Version conflict detected')).toBeVisible();
    await expect(page.locator('text=Local version: Conflict Test - Offline Edit')).toBeVisible();
    await expect(page.locator('text=Server version: Conflict Test - Online Edit')).toBeVisible();
    
    // Choose to keep local version
    await page.click('[data-testid="keep-local-version"]');
    await waitForSync(page);
    
    // Verify local version won
    await page2.reload();
    await expect(page2.locator('[data-testid="questionnaire-name"]')).toHaveValue('Conflict Test - Offline Edit');
    
    // Cleanup
    await context2.close();
  });
  
  test('should handle network interruptions gracefully', async ({ page, context }) => {
    // Create questionnaire
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Network Test');
    
    // Simulate flaky network by going offline/online repeatedly
    for (let i = 0; i < 3; i++) {
      // Go offline
      await simulateOffline(page);
      
      // Make changes
      await page.click('[data-testid="add-page"]');
      await page.fill('[data-testid="page-title"]', `Page ${i + 1}`);
      
      // Go online briefly
      await simulateOnline(page);
      
      // Wait a bit for partial sync
      await page.waitForTimeout(1000);
      
      // Go offline again before sync completes
      await simulateOffline(page);
    }
    
    // Finally go online and stay online
    await simulateOnline(page);
    await waitForSync(page);
    
    // Verify all changes were eventually synced
    await page.reload();
    for (let i = 0; i < 3; i++) {
      await expect(page.locator(`text=Page ${i + 1}`)).toBeVisible();
    }
    
    // Verify no duplicate pages were created
    const pageCount = await page.locator('[data-testid^="page-"]').count();
    expect(pageCount).toBe(3);
  });
  
  test('should maintain data integrity during offline edits', async ({ page, context }) => {
    // Create complex questionnaire structure
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Data Integrity Test');
    
    // Add page with questions
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Test Page');
    
    // Add various question types
    const questionTypes = ['text', 'single_choice', 'multiple_choice', 'rating'];
    for (const type of questionTypes) {
      await page.click('[data-testid="add-question"]');
      await page.selectOption('[data-testid="question-type"]', type);
      await page.fill('[data-testid="question-text"]', `${type} question`);
    }
    
    // Add variables
    await page.click('[data-testid="variables-tab"]');
    await page.click('[data-testid="add-variable"]');
    await page.fill('[data-testid="variable-name"]', 'testVar');
    await page.fill('[data-testid="variable-formula"]', 'q1 + q2');
    
    // Save online first
    await page.click('[data-testid="save-button"]');
    await page.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
    
    // Go offline
    await simulateOffline(page);
    
    // Make complex edits
    await page.click('[data-testid="question-0"]');
    await page.fill('[data-testid="question-text"]', 'Updated text question');
    
    await page.click('[data-testid="question-1"]');
    await page.click('[data-testid="add-option"]');
    await page.fill('[data-testid="option-3"]', 'New option');
    
    // Reorder questions
    await page.dragAndDrop('[data-testid="question-0"]', '[data-testid="question-2"]');
    
    // Go online
    await simulateOnline(page);
    await waitForSync(page);
    
    // Verify all changes persisted correctly
    await page.reload();
    
    // Check updated text
    await expect(page.locator('[data-testid="question-text"]').first()).toHaveValue('Updated text question');
    
    // Check new option exists
    await page.click('[data-testid="question-1"]');
    await expect(page.locator('[data-testid="option-3"]')).toHaveValue('New option');
    
    // Verify question order changed
    const questionTexts = await page.locator('[data-testid^="question-"] [data-testid="question-text"]').allTextContents();
    expect(questionTexts[0]).toContain('single_choice');
    expect(questionTexts[1]).toContain('Updated text');
  });
  
  test('should show appropriate UI feedback during sync states', async ({ page, context }) => {
    // Create questionnaire
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'UI Feedback Test');
    
    // Go offline
    await simulateOffline(page);
    
    // Verify offline UI elements
    await verifyOfflineIndicator(page);
    await expect(page.locator('[data-testid="offline-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-banner"]')).toContainText('Working offline');
    
    // Make changes
    await page.click('[data-testid="add-page"]');
    
    // Verify offline save indication
    const saveToast = page.locator('[data-testid="toast"]:has-text("Saved offline")');
    await expect(saveToast).toBeVisible();
    
    // Check sync queue indicator
    await expect(page.locator('[data-testid="sync-queue-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="sync-queue-badge"]')).toContainText('1');
    
    // Go online
    await simulateOnline(page);
    
    // Verify sync UI progression
    await verifySyncInProgress(page);
    await expect(page.locator('[data-testid="sync-progress"]')).toBeVisible();
    
    // Wait for sync complete
    await waitForSync(page);
    
    // Verify success indication
    await expect(page.locator('[data-testid="toast"]:has-text("Sync complete")').last()).toBeVisible();
    await expect(page.locator('[data-testid="sync-queue-badge"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="offline-banner"]')).not.toBeVisible();
  });
});