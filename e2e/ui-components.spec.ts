import { test, expect } from '@playwright/test';
import { mockAuth } from './fixtures/auth';

test.describe('UI Components', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await page.goto('/design');
  });

  test.describe('Buttons', () => {
    test('should display primary button styles', async ({ page }) => {
      // Save button should have primary styles
      const saveButton = page.locator('button:has-text("Save")').first();
      await expect(saveButton).toHaveClass(/bg-indigo-600/);
      await expect(saveButton).toHaveClass(/text-white/);
      
      // Hover effect
      await saveButton.hover();
      await expect(saveButton).toHaveClass(/hover:bg-indigo-500/);
    });

    test('should display secondary button styles', async ({ page }) => {
      // Load button should have secondary styles
      const loadButton = page.locator('button:has-text("Load")').first();
      await expect(loadButton).toHaveClass(/ring-1/);
      await expect(loadButton).toHaveClass(/ring-gray-300/);
    });

    test('should show loading state', async ({ page }) => {
      // Trigger save to see loading state
      await page.click('button:has-text("Save")');
      
      // Should show spinner
      const spinner = page.locator('svg.animate-spin');
      await expect(spinner).toBeVisible();
    });
  });

  test.describe('Cards', () => {
    test('should display card containers', async ({ page }) => {
      // Switch to structural view to see cards
      await page.click('button:has-text("Structure")');
      
      // Page cards should have proper styling
      const pageCard = page.locator('.page-card').first();
      await expect(pageCard).toHaveClass(/rounded-lg/);
      await expect(pageCard).toHaveClass(/bg-white/);
      await expect(pageCard).toHaveClass(/shadow/);
    });
  });

  test.describe('Empty States', () => {
    test('should display empty state with icon and message', async ({ page }) => {
      // Visual mode shows empty state when no questions
      const emptyState = page.locator('.empty-state');
      await expect(emptyState).toBeVisible();
      
      // Check icon
      await expect(emptyState.locator('svg')).toBeVisible();
      
      // Check message
      await expect(emptyState).toContainText('No questions yet');
      await expect(emptyState).toContainText('Drag a question type');
    });

    test('should display dashed border for add actions', async ({ page }) => {
      // Switch to structural view
      await page.click('button:has-text("Structure")');
      
      // Add page button should have dashed border
      const addPageButton = page.locator('button:has-text("Add Page")');
      await expect(addPageButton).toHaveClass(/border-dashed/);
    });
  });

  test.describe('Tabs', () => {
    test('should display tab navigation', async ({ page }) => {
      // Properties panel tabs
      const tabsContainer = page.locator('.properties-panel');
      
      // Check tab buttons
      await expect(tabsContainer.locator('button:has-text("Properties")')).toBeVisible();
      await expect(tabsContainer.locator('button:has-text("Style")')).toBeVisible();
      
      // Active tab should have underline
      const activeTab = tabsContainer.locator('button:has-text("Properties")');
      await expect(activeTab).toHaveClass(/border-b-2/);
      await expect(activeTab).toHaveClass(/border-blue-500/);
    });

    test('should switch between tabs', async ({ page }) => {
      // Add a question first
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      await page.locator('.question-container').click();
      
      // Click Style tab
      await page.click('.properties-panel button:has-text("Style")');
      
      // Style tab should be active
      const styleTab = page.locator('.properties-panel button:has-text("Style")');
      await expect(styleTab).toHaveClass(/border-blue-500/);
      
      // Properties tab should not be active
      const propertiesTab = page.locator('.properties-panel button:has-text("Properties")');
      await expect(propertiesTab).not.toHaveClass(/border-blue-500/);
    });
  });

  test.describe('Form Inputs', () => {
    test('should display modern input styling', async ({ page }) => {
      // Add a question to see form inputs
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      await page.locator('.question-container').click();
      
      // Check input styling
      const textarea = page.locator('textarea[placeholder="Enter question text..."]');
      await expect(textarea).toHaveClass(/rounded-md/);
      await expect(textarea).toHaveClass(/border/);
      
      // Focus state
      await textarea.focus();
      await expect(textarea).toHaveClass(/focus:ring-2/);
      await expect(textarea).toHaveClass(/focus:ring-blue-500/);
    });

    test('should display select dropdown styling', async ({ page }) => {
      // Add a question
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      await page.locator('.question-container').click();
      
      // Check select styling
      const select = page.locator('select').first();
      await expect(select).toHaveClass(/rounded-md/);
      await expect(select).toHaveClass(/border/);
    });
  });

  test.describe('Toggles', () => {
    test('should display toggle switches', async ({ page }) => {
      // Add a question and go to properties
      const textButton = page.locator('button:has-text("Text/Instruction")');
      await textButton.dragTo(page.locator('.page-canvas'));
      await page.locator('.question-container').click();
      
      // Look for toggle in timing section
      const timingCheckbox = page.locator('input[type="checkbox"]').first();
      await expect(timingCheckbox.locator('..')).toHaveClass(/rounded-full/);
    });
  });

  test.describe('Shadows and Elevation', () => {
    test('should apply consistent shadow system', async ({ page }) => {
      // Cards should have shadows
      await page.click('button:has-text("Structure")');
      
      const card = page.locator('.page-card').first();
      await expect(card).toHaveClass(/shadow/);
      
      // Buttons should have shadow-sm
      const button = page.locator('button:has-text("Save")').first();
      await expect(button).toHaveClass(/shadow-sm/);
    });
  });

  test.describe('Responsive Typography', () => {
    test('should use appropriate text sizes', async ({ page }) => {
      // Main heading
      const heading = page.locator('h2').first();
      await expect(heading).toHaveClass(/text-2xl/);
      
      // Labels
      const label = page.locator('label').first();
      await expect(label).toHaveClass(/text-sm/);
    });
  });

  test.describe('Color Consistency', () => {
    test('should use consistent color palette', async ({ page }) => {
      // Primary actions use indigo
      const primaryButton = page.locator('button:has-text("Save")').first();
      await expect(primaryButton).toHaveClass(/bg-indigo-600/);
      
      // Active states use indigo
      const activeTab = page.locator('.border-blue-500').first();
      await expect(activeTab).toBeVisible();
      
      // Text uses gray scale
      const bodyText = page.locator('.text-gray-600').first();
      await expect(bodyText).toBeVisible();
    });
  });
});