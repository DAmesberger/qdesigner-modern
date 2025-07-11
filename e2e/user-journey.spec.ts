import { test, expect } from '@playwright/test';

test.describe('Complete User Journey', () => {
  test('should complete full workflow from login to creating questionnaire', async ({ page }) => {
    // 1. Start at home page - should redirect to login
    await page.goto('/');
    await expect(page).toHaveURL('/login');
    
    // 2. Try to access protected route - should stay on login
    await page.goto('/design');
    await expect(page).toHaveURL('/login');
    
    // 3. Mock successful login
    await page.evaluate(() => {
      localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        user: {
          id: 'test-user-id',
          email: 'test@example.com'
        }
      }));
    });
    
    // 4. Navigate to designer
    await page.goto('/design');
    await expect(page).toHaveURL('/design');
    
    // 5. Verify user is logged in
    await expect(page.locator('.user-menu')).toContainText('test@example.com');
    
    // 6. Add a question
    const textButton = page.locator('button:has-text("Text/Instruction")');
    await textButton.dragTo(page.locator('.page-canvas'));
    
    // 7. Verify question was added
    await expect(page.locator('.question-container')).toHaveCount(1);
    
    // 8. Edit question properties
    await page.locator('.question-container').click();
    await page.fill('textarea[placeholder="Enter question text..."]', 'Welcome to the survey!');
    
    // 9. Switch to style tab
    await page.click('.properties-panel button:has-text("Style")');
    await expect(page.locator('.style-editor')).toBeVisible();
    
    // 10. Add another question
    const choiceButton = page.locator('button:has-text("Multiple Choice")');
    await choiceButton.dragTo(page.locator('.page-canvas'));
    
    // 11. Verify two questions exist
    await expect(page.locator('.question-container')).toHaveCount(2);
    
    // 12. Test preview
    await page.click('button:has-text("Test Page")');
    await expect(page.locator('.test-runner-modal')).toBeVisible();
    
    // 13. Close preview
    await page.click('.test-runner-modal button[aria-label="Close"]');
    await expect(page.locator('.test-runner-modal')).not.toBeVisible();
    
    // 14. Navigate to settings
    await page.click('.user-menu button');
    await page.click('a:has-text("Settings")');
    await expect(page).toHaveURL('/settings');
    
    // 15. Navigate back to designer
    await page.click('a:has-text("Designer")');
    await expect(page).toHaveURL('/design');
    
    // 16. Sign out
    await page.click('.user-menu button');
    await page.click('button:has-text("Sign out")');
    
    // 17. Should be redirected to login
    await expect(page).toHaveURL('/login');
  });

  test('should persist questionnaire state across page reloads', async ({ page }) => {
    // Mock authentication
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        user: {
          id: 'test-user-id',
          email: 'test@example.com'
        }
      }));
    });
    
    await page.goto('/design');
    
    // Add a question
    const textButton = page.locator('button:has-text("Text/Instruction")');
    await textButton.dragTo(page.locator('.page-canvas'));
    
    // Edit the question
    await page.locator('.question-container').click();
    await page.fill('textarea[placeholder="Enter question text..."]', 'This should persist');
    
    // Reload the page
    await page.reload();
    
    // Question should still be there
    await expect(page.locator('.question-container')).toHaveCount(1);
    await expect(page.locator('.prompt')).toContainText('This should persist');
  });

  test('should handle navigation errors gracefully', async ({ page }) => {
    // Mock authentication
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        user: {
          id: 'test-user-id',
          email: 'test@example.com'
        }
      }));
    });
    
    // Try to navigate to non-existent route
    await page.goto('/non-existent-route');
    
    // Should show 404 or redirect to a valid page
    const url = page.url();
    expect(url).toMatch(/\/(login|design|404)/);
  });

  test('should maintain state when switching between view modes', async ({ page }) => {
    // Mock authentication and navigate
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        user: {
          id: 'test-user-id',
          email: 'test@example.com'
        }
      }));
    });
    
    await page.goto('/design');
    
    // Add questions in visual mode
    const textButton = page.locator('button:has-text("Text/Instruction")');
    await textButton.dragTo(page.locator('.page-canvas'));
    
    const choiceButton = page.locator('button:has-text("Multiple Choice")');
    await choiceButton.dragTo(page.locator('.page-canvas'));
    
    // Switch to structure view
    await page.click('button:has-text("Structure")');
    
    // Questions should still be there
    await expect(page.locator('[data-question-id]')).toHaveCount(2);
    
    // Switch back to visual
    await page.click('button:has-text("Visual")');
    
    // Questions should still be visible
    await expect(page.locator('.question-container')).toHaveCount(2);
  });
});