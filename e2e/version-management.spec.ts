import { test, expect } from '@playwright/test';
import { createTestUser, loginUser } from './helpers/auth';

test.describe('Version Management E2E Tests', () => {
  let testUser: any;
  
  test.beforeAll(async () => {
    testUser = await createTestUser({
      email: `version-test-${Date.now()}@example.com`,
      password: 'VersionTest123!'
    });
  });
  
  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
    await page.goto('/designer');
    await page.waitForSelector('[data-testid="designer-canvas"]');
  });
  
  test('should create and manage questionnaire versions', async ({ page }) => {
    // Create initial questionnaire
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Version Test Questionnaire');
    await page.fill('[data-testid="questionnaire-description"]', 'Testing version management');
    
    // Add initial content
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Version 1 Page');
    
    // Save initial version
    await page.click('[data-testid="save-button"]');
    await page.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
    
    // Open version menu
    await page.click('[data-testid="version-button"]');
    await page.waitForSelector('[data-testid="version-menu"]');
    
    // Verify version 1 is current
    await expect(page.locator('[data-testid="current-version"]')).toContainText('Version 1');
    
    // Create new version
    await page.click('[data-testid="save-new-version"]');
    await page.waitForSelector('[data-testid="version-modal"]');
    
    // Fill version notes
    await page.fill('[data-testid="version-notes"]', 'Added new features in version 2');
    await page.click('[data-testid="save-version-button"]');
    
    // Wait for version to be saved
    await page.waitForSelector('[data-testid="toast"]:has-text("Saved as version 2")');
    
    // Verify now on version 2
    await expect(page.locator('[data-testid="current-version"]')).toContainText('Version 2');
    
    // Make changes to version 2
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Version 2 Page');
    
    // Open version history
    await page.click('[data-testid="version-button"]');
    await page.waitForSelector('[data-testid="version-history"]');
    
    // Verify both versions appear
    await expect(page.locator('[data-testid="version-item"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="version-item"]:has-text("Version 2")')).toContainText('Current');
    await expect(page.locator('[data-testid="version-item"]:has-text("Version 1")')).toBeVisible();
  });
  
  test('should load previous versions', async ({ page }) => {
    // Create questionnaire with multiple versions
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Load Version Test');
    
    // Version 1 content
    await page.click('[data-testid="add-question"]');
    await page.fill('[data-testid="question-text"]', 'Version 1 Question');
    await page.click('[data-testid="save-button"]');
    await page.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
    
    // Create version 2
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="save-new-version"]');
    await page.fill('[data-testid="version-notes"]', 'Version 2 changes');
    await page.click('[data-testid="save-version-button"]');
    await page.waitForSelector('[data-testid="toast"]:has-text("Saved as version 2")');
    
    // Modify version 2
    await page.click('[data-testid="question-0"]');
    await page.fill('[data-testid="question-text"]', 'Version 2 Question Updated');
    await page.click('[data-testid="add-question"]');
    await page.fill('[data-testid="question-text"]', 'Version 2 New Question');
    
    // Load version 1
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="version-item"]:has-text("Version 1")');
    await page.waitForSelector('[data-testid="toast"]:has-text("Loaded version 1")');
    
    // Verify version 1 content
    await expect(page.locator('[data-testid="question-text"]').first()).toHaveValue('Version 1 Question');
    await expect(page.locator('[data-testid="question"]')).toHaveCount(1);
    
    // Load version 2 again
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="version-item"]:has-text("Version 2")');
    
    // Verify version 2 content
    await expect(page.locator('[data-testid="question-text"]').first()).toHaveValue('Version 2 Question Updated');
    await expect(page.locator('[data-testid="question"]')).toHaveCount(2);
  });
  
  test('should publish and unpublish versions', async ({ page }) => {
    // Create questionnaire
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Publish Test');
    await page.click('[data-testid="save-button"]');
    
    // Open version menu
    await page.click('[data-testid="version-button"]');
    
    // Publish current version
    await page.click('[data-testid="publish-version"]');
    await page.waitForSelector('[data-testid="confirm-publish-dialog"]');
    await page.click('[data-testid="confirm-publish"]');
    
    // Verify published status
    await page.waitForSelector('[data-testid="toast"]:has-text("Version published")');
    await expect(page.locator('[data-testid="version-status"]')).toContainText('Published');
    
    // Create new version
    await page.click('[data-testid="save-new-version"]');
    await page.fill('[data-testid="version-notes"]', 'New unpublished version');
    await page.click('[data-testid="save-version-button"]');
    
    // Verify new version is not published
    await expect(page.locator('[data-testid="version-status"]')).not.toContainText('Published');
    
    // Publish new version (should unpublish old one)
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="publish-version"]');
    await page.click('[data-testid="confirm-publish"]');
    
    // Verify only new version is published
    await page.click('[data-testid="version-button"]');
    await expect(page.locator('[data-testid="version-item"]:has-text("Version 2")')).toContainText('Published');
    await expect(page.locator('[data-testid="version-item"]:has-text("Version 1")')).not.toContainText('Published');
  });
  
  test('should show version comparison', async ({ page }) => {
    // Create questionnaire with versions
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Compare Test');
    
    // Version 1
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Original Page');
    await page.click('[data-testid="save-button"]');
    
    // Version 2
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="save-new-version"]');
    await page.fill('[data-testid="version-notes"]', 'Modified page title');
    await page.click('[data-testid="save-version-button"]');
    
    await page.click('[data-testid="page-0"]');
    await page.fill('[data-testid="page-title"]', 'Modified Page');
    
    // Open version comparison
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="compare-versions"]');
    await page.waitForSelector('[data-testid="version-comparison"]');
    
    // Select versions to compare
    await page.selectOption('[data-testid="compare-from"]', '1');
    await page.selectOption('[data-testid="compare-to"]', '2');
    
    // Verify differences shown
    await expect(page.locator('[data-testid="diff-item"]')).toBeVisible();
    await expect(page.locator('[data-testid="diff-removed"]')).toContainText('Original Page');
    await expect(page.locator('[data-testid="diff-added"]')).toContainText('Modified Page');
  });
  
  test('should handle version rollback', async ({ page }) => {
    // Create questionnaire with problematic version
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Rollback Test');
    
    // Good version 1
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Good Page');
    await page.click('[data-testid="add-question"]');
    await page.fill('[data-testid="question-text"]', 'Good Question');
    await page.click('[data-testid="save-button"]');
    
    // Publish version 1
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="publish-version"]');
    await page.click('[data-testid="confirm-publish"]');
    
    // Create problematic version 2
    await page.click('[data-testid="save-new-version"]');
    await page.fill('[data-testid="version-notes"]', 'Breaking changes');
    await page.click('[data-testid="save-version-button"]');
    
    // Delete content (simulating a problem)
    await page.click('[data-testid="page-0"]');
    await page.click('[data-testid="delete-page"]');
    await page.click('[data-testid="confirm-delete"]');
    
    // Realize mistake, rollback to version 1
    await page.click('[data-testid="version-button"]');
    await page.hover('[data-testid="version-item"]:has-text("Version 1")');
    await page.click('[data-testid="rollback-to-version"]');
    
    // Confirm rollback
    await page.waitForSelector('[data-testid="rollback-dialog"]');
    await expect(page.locator('[data-testid="rollback-warning"]')).toContainText('This will create version 3');
    await page.click('[data-testid="confirm-rollback"]');
    
    // Verify rollback succeeded
    await page.waitForSelector('[data-testid="toast"]:has-text("Rolled back to version 1")');
    await expect(page.locator('[data-testid="current-version"]')).toContainText('Version 3');
    
    // Verify content restored
    await expect(page.locator('[data-testid="page-title"]')).toHaveValue('Good Page');
    await expect(page.locator('[data-testid="question-text"]')).toHaveValue('Good Question');
  });
  
  test('should maintain version integrity across sessions', async ({ page, context }) => {
    // Create questionnaire
    await page.click('[data-testid="create-new"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Session Test');
    await page.click('[data-testid="save-button"]');
    
    // Get questionnaire ID
    const url = page.url();
    const questionnaireId = url.split('/').pop();
    
    // Create version 2
    await page.click('[data-testid="version-button"]');
    await page.click('[data-testid="save-new-version"]');
    await page.fill('[data-testid="version-notes"]', 'Version 2');
    await page.click('[data-testid="save-version-button"]');
    
    // Add unique content to version 2
    await page.click('[data-testid="add-variable"]');
    await page.fill('[data-testid="variable-name"]', 'version2Var');
    await page.fill('[data-testid="variable-formula"]', '42');
    
    // Open in new tab (simulate different session)
    const page2 = await context.newPage();
    await loginUser(page2, testUser.email, testUser.password);
    await page2.goto(`/designer/${questionnaireId}`);
    await page2.waitForSelector('[data-testid="designer-canvas"]');
    
    // Verify same version loaded
    await expect(page2.locator('[data-testid="current-version"]')).toContainText('Version 2');
    await expect(page2.locator('[data-testid="variable-name"]')).toHaveValue('version2Var');
    
    // Make change in page2
    await page2.click('[data-testid="add-page"]');
    await page2.fill('[data-testid="page-title"]', 'Page from Session 2');
    
    // Save as new version in page2
    await page2.click('[data-testid="version-button"]');
    await page2.click('[data-testid="save-new-version"]');
    await page2.fill('[data-testid="version-notes"]', 'Created from session 2');
    await page2.click('[data-testid="save-version-button"]');
    
    // Refresh page1
    await page.reload();
    
    // Verify page1 sees the new version
    await page.click('[data-testid="version-button"]');
    await expect(page.locator('[data-testid="version-item"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="version-item"]:has-text("Version 3")')).toContainText('Created from session 2');
    
    await page2.close();
  });
});