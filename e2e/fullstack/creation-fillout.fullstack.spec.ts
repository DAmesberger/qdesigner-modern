import { expect, test } from '@playwright/test';
import { provisionPublishedQuestionnaire } from '../helpers/fullstack-api';

test.describe('@fullstack questionnaire creation and participant fillout', () => {
  test('creates, publishes, opens by code, and reaches completion', async ({ page }) => {
    await page.goto('/');
    const provisioned = await provisionPublishedQuestionnaire(page);

    await page.goto(`/${provisioned.questionnaireCode}`);
    await expect(page.locator('[data-testid="fillout-welcome-screen"]')).toBeVisible();

    const sessionCreated = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'POST' &&
        url.pathname === '/api/sessions' &&
        response.status() === 201
      );
    });

    await page.locator('[data-testid="fillout-start-button"]').click();
    await sessionCreated;

    await expect(page.locator('[data-testid="fillout-runtime-canvas"]')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('[data-testid="fillout-completion-screen"]')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('[data-testid="fillout-error"]')).toHaveCount(0);
  });
});
