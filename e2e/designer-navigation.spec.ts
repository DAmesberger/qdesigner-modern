import { test, expect } from '@playwright/test';

test.describe('Designer Navigation and UI', () => {
  // Mock authentication
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
    await page.waitForLoadState('networkidle');
  });

  test('should display page header with questionnaire info', async ({ page }) => {
    // Check main heading
    await expect(page.locator('h2.text-2xl')).toBeVisible();
    
    // Check metadata (pages and questions count)
    await expect(page.locator('text=/\\d+ pages/')).toBeVisible();
    await expect(page.locator('text=/\\d+ questions/')).toBeVisible();
  });

  test('should display save/load toolbar', async ({ page }) => {
    // Save button should be visible
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
    
    // Load button should be visible
    await expect(page.locator('button:has-text("Load")')).toBeVisible();
  });

  test('should display secondary toolbar with view modes', async ({ page }) => {
    // View mode toggle should be visible
    const structureButton = page.locator('button:has-text("Structure")');
    const visualButton = page.locator('button:has-text("Visual")');
    
    await expect(structureButton).toBeVisible();
    await expect(visualButton).toBeVisible();
    
    // Visual should be active by default
    await expect(visualButton).toHaveClass(/bg-white/);
  });

  test('should display left sidebar with tabs', async ({ page }) => {
    // Check sidebar tabs
    await expect(page.locator('button:has-text("Questions")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Variables")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Flow")').first()).toBeVisible();
    
    // Questions tab should be active by default
    await expect(page.locator('button:has-text("Questions")').first()).toHaveClass(/bg-gray-50/);
  });

  test('should display right properties panel', async ({ page }) => {
    // Properties panel should be visible
    await expect(page.locator('.properties-panel')).toBeVisible();
    
    // Should show tabs
    await expect(page.locator('.properties-panel button:has-text("Properties")')).toBeVisible();
    await expect(page.locator('.properties-panel button:has-text("Style")')).toBeVisible();
  });

  test('should switch between view modes', async ({ page }) => {
    // Click Structure view
    await page.click('button:has-text("Structure")');
    
    // Should show structural canvas
    await expect(page.locator('.canvas-container')).toBeVisible();
    
    // Click Visual view
    await page.click('button:has-text("Visual")');
    
    // Should show visual canvas
    await expect(page.locator('.page-canvas')).toBeVisible();
  });

  test('should switch between sidebar tabs', async ({ page }) => {
    // Click Variables tab
    await page.click('button:has-text("Variables")');
    
    // Should show variable manager
    await expect(page.locator('text="Variable Manager"')).toBeVisible();
    
    // Click Flow tab
    await page.click('button:has-text("Flow")');
    
    // Should show flow message
    await expect(page.locator('text="Flow control coming soon"')).toBeVisible();
    
    // Click back to Questions
    await page.click('button:has-text("Questions")');
    
    // Should show question palette
    await expect(page.locator('button:has-text("Multiple Choice")')).toBeVisible();
  });

  test('should switch between properties panel tabs', async ({ page }) => {
    // Add a question first
    const textButton = page.locator('button:has-text("Text/Instruction")');
    await textButton.dragTo(page.locator('.page-canvas'));
    
    // Select the question
    await page.locator('.question-container').click();
    
    // Switch to Style tab
    await page.click('.properties-panel button:has-text("Style")');
    
    // Should show style editor
    await expect(page.locator('.style-editor')).toBeVisible();
    
    // Script tab should be visible for questions
    await expect(page.locator('.properties-panel button:has-text("Script")')).toBeVisible();
    
    // Switch to Script tab
    await page.click('.properties-panel button:has-text("Script")');
    
    // Should show script editor
    await expect(page.locator('.script-editor')).toBeVisible();
  });

  test('should show empty state in visual mode', async ({ page }) => {
    // Should show empty state
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('text="No questions yet"')).toBeVisible();
    await expect(page.locator('text="Drag a question type from the sidebar"')).toBeVisible();
  });

  test('should display undo/redo buttons', async ({ page }) => {
    // Check undo/redo buttons in toolbar
    const undoButton = page.locator('button[title="Undo (Ctrl+Z)"]');
    const redoButton = page.locator('button[title="Redo (Ctrl+Shift+Z)"]');
    
    await expect(undoButton).toBeVisible();
    await expect(redoButton).toBeVisible();
    
    // Should be disabled initially
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
  });

  test('should display preview and validate buttons', async ({ page }) => {
    await expect(page.locator('button:has-text("Preview")')).toBeVisible();
    await expect(page.locator('button:has-text("Validate")')).toBeVisible();
  });

  test('should display status bar', async ({ page }) => {
    // Status bar at bottom
    const statusBar = page.locator('.bg-gray-100.border-t');
    await expect(statusBar).toBeVisible();
    
    // Should show page and question counts
    await expect(statusBar).toContainText(/\d+ page/);
    await expect(statusBar).toContainText(/\d+ question/);
    
    // Should have validate link
    await expect(statusBar.locator('button:has-text("Validate")')).toBeVisible();
    
    // Should show save status
    await expect(statusBar).toContainText(/Last saved:/);
  });

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('should adapt layout for tablet', async ({ page }) => {
      // Properties panel should still be visible
      await expect(page.locator('.properties-panel')).toBeVisible();
      
      // Left sidebar should be visible
      await expect(page.locator('button:has-text("Questions")').first()).toBeVisible();
    });
  });

  test.describe('Mobile Design', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should hide sidebars on mobile', async ({ page }) => {
      // Properties panel should be hidden
      await expect(page.locator('.properties-panel')).not.toBeVisible();
      
      // Question palette sidebar should be hidden
      await expect(page.locator('button:has-text("Questions")').first()).not.toBeVisible();
      
      // Main canvas should still be visible
      await expect(page.locator('.page-canvas')).toBeVisible();
    });
  });
});