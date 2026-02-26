import { expect, test } from '@playwright/test';
import { provisionPublishedQuestionnaire } from '../helpers/fullstack-api';

test.describe('@fullstack questionnaire creation and participant fillout', () => {
  test('creates, publishes, opens by code, and reaches completion', async ({ page, request }) => {
    await page.goto('/');
    const provisioned = await provisionPublishedQuestionnaire(request);

    await page.goto(`/${provisioned.questionnaireCode}`);
    await expect(page.locator('[data-testid="fillout-welcome-screen"]')).toBeVisible();
    const startButton = page.getByRole('button', { name: /start questionnaire/i });
    await expect(startButton).toBeVisible();

    const sessionCreated = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'POST' &&
        url.pathname === '/api/sessions' &&
        response.status() === 201
      );
    });

    await startButton.click();
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
