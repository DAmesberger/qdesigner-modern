import { expect, test } from '@playwright/test';
import { buildFilloutPath, provisionPublishedQuestionnaire } from '../helpers/fullstack-api';

test.describe('@fullstack questionnaire creation and participant fillout', () => {
  test('creates, publishes, opens by code, and reaches completion', async ({ page, request }) => {
    await page.goto('/');
    const provisioned = await provisionPublishedQuestionnaire(request);

    await page.goto(buildFilloutPath(provisioned.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();
    const startButton = page.getByTestId('fillout-start-button');
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

    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('fillout-error')).toHaveCount(0);
  });
});
