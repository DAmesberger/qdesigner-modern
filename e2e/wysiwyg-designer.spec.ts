import { test, expect } from '@playwright/test';

test.describe('WYSIWYG Designer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design');
    await page.waitForLoadState('networkidle');
    
    // Switch to WYSIWYG view mode
    await page.click('button:has-text("Visual")');
  });

  test.describe('View Mode Toggle', () => {
    test('should switch between structural and visual views', async ({ page }) => {
      // Should be in visual mode
      await expect(page.locator('.page-canvas')).toBeVisible();
      
      // Switch to structural view
      await page.click('button:has-text("Structure")');
      
      // Should show structural canvas (PageCanvas component)
      await expect(page.locator('.canvas-container')).toBeVisible();
      
      // Switch back to visual
      await page.click('button:has-text("Visual")');
      await expect(page.locator('.page-canvas')).toBeVisible();
    });
  });

  test.describe('Adding Questions', () => {
    test('should add choice question via drag and drop', async ({ page }) => {
      // Find choice question button in palette
      const choiceButton = page.locator('button:has-text("Multiple Choice")');
      const canvas = page.locator('.page-canvas');
      
      // Drag and drop
      await choiceButton.dragTo(canvas);
      
      // Verify question was added
      await expect(page.locator('.question-container')).toHaveCount(1);
      await expect(page.locator('.prompt')).toContainText('New choice question');
    });

    test('should add text question', async ({ page }) => {
      const textButton = page.locator('button:has-text("Text/Instruction")');
      const canvas = page.locator('.page-canvas');
      
      await textButton.dragTo(canvas);
      
      await expect(page.locator('.question-container')).toHaveCount(1);
      await expect(page.locator('.prompt')).toContainText('New text question');
    });

    test('should add scale question', async ({ page }) => {
      const scaleButton = page.locator('button:has-text("Rating Scale")');
      const canvas = page.locator('.page-canvas');
      
      await scaleButton.dragTo(canvas);
      
      await expect(page.locator('.question-container')).toHaveCount(1);
      await expect(page.locator('.scale-container')).toBeVisible();
    });
  });

  test.describe('Question Editing', () => {
    test('should edit question text inline', async ({ page }) => {
      // Add a question first
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      
      // Click on the question prompt to edit
      const prompt = page.locator('.prompt');
      await prompt.click();
      
      // Should show editor
      const editor = page.locator('.prompt-editor');
      await expect(editor).toBeVisible();
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      
      // Clear and type new text
      await editor.selectText();
      await editor.type('This is my custom question text');
      await page.keyboard.press('Escape');
      
      // Verify text updated
      await expect(prompt).toContainText('This is my custom question text');
    });

    test('should edit question properties via panel', async ({ page }) => {
      // Add a question
      const choiceButton = page.locator('button:has-text("Multiple Choice")');
      await choiceButton.dragTo(page.locator('.page-canvas'));
      
      // Select the question
      await page.locator('.question-container').click();
      
      // Should show in properties panel
      await expect(page.locator('.properties-panel h3')).toContainText('Properties');
      
      // Edit prompt text in properties
      const promptTextarea = page.locator('textarea[placeholder="Enter question text..."]');
      await promptTextarea.fill('What is your favorite color?');
      
      // Verify visual updated
      await expect(page.locator('.prompt')).toContainText('What is your favorite color?');
    });

    test('should delete question', async ({ page }) => {
      // Add a question
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      
      // Select the question
      await page.locator('.question-container').click();
      
      // Click delete button
      await page.locator('.edit-controls button:has-text("Delete")').click();
      
      // Verify question removed
      await expect(page.locator('.question-container')).toHaveCount(0);
      await expect(page.locator('.empty-state')).toBeVisible();
    });
  });

  test.describe('Style Editor', () => {
    test('should switch to style tab', async ({ page }) => {
      // Add a question to have something to style
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      
      // Select the question
      await page.locator('.question-container').click();
      
      // Switch to Style tab
      await page.click('.properties-panel button:has-text("Style")');
      
      // Should show style editor
      await expect(page.locator('.style-editor')).toBeVisible();
      
      // Check tabs exist
      const tabs = page.locator('.style-editor .tab');
      await expect(tabs).toHaveCount(3);
      await expect(tabs.nth(0)).toContainText('Global');
      await expect(tabs.nth(1)).toContainText('Page');
      await expect(tabs.nth(2)).toContainText('Question');
    });

    test('should update theme colors', async ({ page }) => {
      // Switch to Style tab
      await page.click('.properties-panel button:has-text("Style")');
      
      // Click on Global tab
      await page.click('.style-editor .tab:has-text("Global")');
      
      // Should show color controls
      await expect(page.locator('.style-editor h3:has-text("Colors")')).toBeVisible();
      
      // Find primary color input
      const primaryColorInput = page.locator('input[type="color"]').first();
      await expect(primaryColorInput).toBeVisible();
    });
  });

  test.describe('Script Editor', () => {
    test('should show script tab for questions', async ({ page }) => {
      // Add a question
      const choiceButton = page.locator('button:has-text("Multiple Choice")');
      await choiceButton.dragTo(page.locator('.page-canvas'));
      
      // Select the question
      await page.locator('.question-container').click();
      
      // Script tab should be visible
      await expect(page.locator('.properties-panel button:has-text("Script")')).toBeVisible();
      
      // Switch to Script tab
      await page.click('.properties-panel button:has-text("Script")');
      
      // Should show script editor with Monaco
      await expect(page.locator('.script-editor')).toBeVisible();
      await expect(page.locator('.monaco-editor')).toBeVisible();
    });
  });

  test.describe('Live Test Runner', () => {
    test('should open test runner', async ({ page }) => {
      // Add a question first
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      
      // Click Test Page button
      await page.click('button:has-text("Test Page")');
      
      // Should show test runner modal
      await expect(page.locator('.test-runner-modal')).toBeVisible();
      
      // Should show device selector
      await expect(page.locator('.device-selector')).toBeVisible();
      
      // Should show the question in preview
      await expect(page.locator('.test-runner-modal .question-container')).toBeVisible();
    });

    test('should close test runner', async ({ page }) => {
      // Add a question and open test runner
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      await page.click('button:has-text("Test Page")');
      
      // Close button should work
      await page.click('.test-runner-modal button[aria-label="Close"]');
      
      // Modal should be gone
      await expect(page.locator('.test-runner-modal')).not.toBeVisible();
    });
  });

  test.describe('Drag and Drop Reordering', () => {
    test('should reorder questions via drag and drop', async ({ page }) => {
      // Add two questions
      const textButton = page.locator('button:has-text("Text/Instruction")');
      const choiceButton = page.locator('button:has-text("Multiple Choice")');
      
      await textButton.dragTo(page.locator('.page-canvas'));
      await choiceButton.dragTo(page.locator('.page-canvas'));
      
      // Edit first question to identify it
      await page.locator('.question-container').first().click();
      await page.fill('textarea[placeholder="Enter question text..."]', 'First Question');
      
      // Edit second question
      await page.locator('.question-container').nth(1).click();
      await page.fill('textarea[placeholder="Enter question text..."]', 'Second Question');
      
      // Verify initial order
      const questions = page.locator('.question-container');
      await expect(questions.first().locator('.prompt')).toContainText('First Question');
      await expect(questions.nth(1).locator('.prompt')).toContainText('Second Question');
      
      // Drag first question below second
      await questions.first().dragTo(questions.nth(1));
      
      // Verify order changed
      await expect(questions.first().locator('.prompt')).toContainText('Second Question');
      await expect(questions.nth(1).locator('.prompt')).toContainText('First Question');
    });
  });
});