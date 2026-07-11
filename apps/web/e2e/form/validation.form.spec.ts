import { expect, test } from './form-fixtures';
import {
  clickContinue,
  continueButton,
  filloutPath,
  numberInputQuestion,
  pollResponses,
  publishFormStudy,
  responseFor,
  setBoundInput,
  startFormSession,
  textInputQuestion,
  waitForCard,
} from './form-api';

/**
 * @form blocking validation (ADR 0029 Half 1, issues #33/#35). Constraint violations gate
 * Continue exactly like required-presence — unconditionally, no policy knob — and the
 * persisted server-side value is always literally what the participant typed and confirmed.
 *
 * The blocking behavior is entirely client-side, so it's asserted OFFLINE (the module mounts
 * online, then the network drops); the answer then syncs once on reconnect. This keeps the
 * lane on the offline-first write path (ADR 0023 D2) and off the `/sync` per-IP rate limiter,
 * which per-response online syncs across the lane's studies would otherwise trip.
 */
test.describe('@form blocking constraint validation → server-side value', () => {
  test.describe.configure({ timeout: 120000 });

  test('required text-input with minLength=5 blocks until satisfied; persists the typed value', async ({
    page,
    context,
    request,
    workspace,
  }) => {
    const study = await publishFormStudy(request, workspace, [
      textInputQuestion('q_text', { prompt: 'Say at least five characters', minLength: 5 }),
    ]);

    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();
    const sessionId = await startFormSession(page);
    expect(sessionId).toBeTruthy();

    const card = await waitForCard(page, 'text-input');
    await context.setOffline(true);
    const input = card.locator('.text-input');
    const message = page.getByTestId('text-input-validation-message');

    // One character: below minLength → blocked, with the module's constraint message shown.
    await setBoundInput(input, 'a');
    await expect(message).toBeVisible();
    await expect(message).toHaveAttribute('role', 'alert');
    await expect(continueButton(page)).toBeDisabled();

    // Enter must not bypass the block — there is no keyboard submit, only the (disabled)
    // Continue button. The same item stays presented.
    await input.focus();
    await page.keyboard.press('Enter');
    await expect(continueButton(page)).toBeDisabled();
    await expect(card).toBeVisible();

    // Five or more characters: the constraint clears and Continue unblocks.
    await setBoundInput(input, 'hello world');
    await expect(message).toHaveCount(0);
    await expect(continueButton(page)).toBeEnabled();

    await clickContinue(page);
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('fillout-error')).toHaveCount(0);
    await context.setOffline(false);

    const responses = await pollResponses(request, sessionId, workspace, 1, 45000);
    expect(responses).toHaveLength(1);
    expect(responseFor(responses, 'q_text').value).toBe('hello world');
  });

  test('number-input min=1 max=10 blocks 250 without clamping; a valid value persists as typed', async ({
    page,
    context,
    request,
    workspace,
  }) => {
    const study = await publishFormStudy(request, workspace, [
      numberInputQuestion('q_num', { prompt: 'Pick 1 to 10', min: 1, max: 10 }),
    ]);

    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();
    const sessionId = await startFormSession(page);

    const card = await waitForCard(page, 'number-input');
    await context.setOffline(true);
    const input = card.locator('.number-input');
    const message = page.getByTestId('number-input-validation-message');

    // 250 is out of range → blocked, message visible, and the field is NEVER rewritten to
    // the bound (ADR 0029: no silent clamp — the value stays literally what was typed).
    await setBoundInput(input, '250');
    await expect(message).toBeVisible();
    await expect(message).toHaveAttribute('role', 'alert');
    await expect(continueButton(page)).toBeDisabled();
    await expect(input).toHaveValue('250');

    // Blur normalizes only the display string — it must not clamp the persisted value.
    await input.blur();
    await expect(input).toHaveValue('250');
    await expect(continueButton(page)).toBeDisabled();

    // A valid value advances and persists as the typed number.
    await setBoundInput(input, '7');
    await expect(message).toHaveCount(0);
    await expect(continueButton(page)).toBeEnabled();

    await clickContinue(page);
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
    await context.setOffline(false);

    const responses = await pollResponses(request, sessionId, workspace, 1, 45000);
    expect(responses).toHaveLength(1);
    expect(responseFor(responses, 'q_num').value).toBe(7);
  });
});
