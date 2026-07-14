import { expect, test } from '@playwright/test';
import {
  buildFilloutPath,
  FILLOUT_ITEMS,
  pollSessionResponses,
  provisionPublishedQuestionnaire,
} from '../helpers/fullstack-api';
// The DOM-overlay drivers are canonical in the @form lane's api module (ADR 0018/0023: every
// form-style question renders as a Svelte card in the overlay). Imported rather than
// re-implemented so the two lanes cannot drift on the same selectors.
import { clickContinue, continueButton, currentCard, waitForCard } from '../form/form-api';

/**
 * @fullstack API-provisioned golden path: create + publish a questionnaire through the API,
 * open it by code as an anonymous participant, ANSWER it, and assert both the completion
 * screen and the values that landed server-side.
 *
 * The answering is the point. This spec previously provisioned questions built by
 * `createAutoAdvanceQuestion` — a fixture that invented a `responseType: {type:'none',
 * delay:20}` auto-advance contract the product has never implemented — and then simply
 * waited for `fillout-completion-screen` without ever answering anything. What actually
 * rendered was a *required* choice question with zero options: Continue permanently
 * disabled, completion unreachable. The spec was asserting a fiction, so it could only fail.
 */
test.describe('@fullstack questionnaire creation and participant fillout', () => {
  test.describe.configure({ timeout: 120000 });

  test('creates, publishes, opens by code, answers, and reaches completion', async ({
    page,
    request,
  }) => {
    const provisioned = await provisionPublishedQuestionnaire(request);

    await page.goto(buildFilloutPath(provisioned.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();

    const sessionCreated = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'POST' &&
        url.pathname === '/api/sessions' &&
        response.status() === 201
      );
    });
    await page.getByTestId('fillout-start-button').click();
    const sessionId = (await (await sessionCreated).json()).id as string;
    expect(sessionId).toBeTruthy();

    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({ timeout: 30000 });

    // Answer each item through its real runtime component, one card at a time.
    for (const item of FILLOUT_ITEMS) {
      const card = await waitForCard(page, 'single-choice');
      await card.locator('.choice-label', { hasText: item.chose }).click();
      await expect(continueButton(page)).toBeEnabled();
      await clickContinue(page);
    }

    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('fillout-error')).toHaveCount(0);
    await expect(currentCard(page, 'single-choice')).toHaveCount(0);

    // The completion screen is client-side state; answers ride the offline-first write path
    // (ADR 0023 D2), so assert they actually reached the server.
    const rows = await pollSessionResponses(request, sessionId, provisioned, FILLOUT_ITEMS.length);
    for (const item of FILLOUT_ITEMS) {
      const row = rows.find((r) => r.question_id === item.id);
      expect(row, `no persisted response for "${item.id}"`).toBeTruthy();
      expect(row!.value).toBe(item.value);
    }
  });
});
