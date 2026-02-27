import { expect, test } from '@playwright/test';

test.describe('@regression runtime fillout harness', () => {
  test('starts the runtime questionnaire on the test harness page', async ({ page }) => {
    await page.goto('/test-runtime');

    const startButton = page.getByTestId('test-runtime-start-button');
    await expect(startButton).toBeVisible();
    await startButton.click();

    await expect(startButton).toBeHidden({ timeout: 30000 });
    await expect(page.getByTestId('test-runtime-canvas')).toBeVisible();
  });
});
