import { expect, test } from '@playwright/test';
import {
  buildFilloutPath,
  deriveQuestionnaireCode,
  getSessionById,
  listProjectQuestionnaires,
  provisionWorkspace,
  pollSessionResponses,
} from '../helpers/fullstack-api';
import {
  addModule,
  createInDesigner,
  publishInDesigner,
  saveAndReload,
} from '../helpers/designer-authoring';
import { clickContinue, continueButton, startFormSession, waitForCard } from '../form/form-api';

test.describe('@fullstack designer to persisted form results', () => {
  test.describe.configure({ timeout: 180000 });

  test('authors three constrained questions, reloads, publishes, and persists exact online answers', async ({
    page,
    request,
    browser,
  }) => {
    const workspace = await provisionWorkspace(request);
    const name = `UI acceptance ${Date.now()}`;
    const designer = await createInDesigner(page, workspace, name);

    const textId = await addModule(designer, 'text-input', 'participant_text');
    await page.getByLabel('Min Length', { exact: true }).fill('5');
    await page.getByLabel('Placeholder Text', { exact: true }).fill('At least five characters');
    const choiceId = await addModule(designer, 'single-choice', 'participant_choice');
    await page.getByTestId('designer-bulk-option-editor').fill('Apple|apple|a\nBanana|banana|b');
    await page.getByTestId('designer-bulk-option-editor').blur();
    const numberId = await addModule(designer, 'number-input', 'participant_number');
    await page.getByLabel('Minimum', { exact: true }).fill('1');
    await page.getByLabel('Maximum', { exact: true }).fill('10');
    await saveAndReload(designer);

    await expect(designer.questionCards).toHaveCount(3);
    for (const [id, internalName] of [
      [textId, 'participant_text'],
      [choiceId, 'participant_choice'],
      [numberId, 'participant_number'],
    ]) {
      await designer.closeFlyoutIfOpen();
      await page.getByTestId(`designer-question-${id}`).click();
      await expect(page.getByTestId('designer-question-id')).toHaveValue(id!);
      await expect(page.getByTestId('designer-question-internal-name')).toHaveValue(internalName!);
      await expect(page.getByLabel('Required question', { exact: true })).toBeChecked();
      if (id === textId) {
        await expect(page.getByLabel('Min Length', { exact: true })).toHaveValue('5');
        await expect(page.getByLabel('Placeholder Text', { exact: true })).toHaveValue(
          'At least five characters'
        );
      } else if (id === choiceId) {
        await expect(page.getByTestId('designer-bulk-option-editor')).toHaveValue(
          'Apple|apple|a\nBanana|banana|b'
        );
      } else {
        await expect(page.getByLabel('Minimum', { exact: true })).toHaveValue('1');
        await expect(page.getByLabel('Maximum', { exact: true })).toHaveValue('10');
      }
    }
    await publishInDesigner(designer);
    const created = (await listProjectQuestionnaires(request, workspace.projectId, workspace)).find(
      (q) => q.name === name
    );
    expect(created?.status).toBe('published');
    for (const part of [created.version_major, created.version_minor, created.version_patch]) {
      expect(Number.isInteger(part)).toBe(true);
    }

    const participantContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const participant = await participantContext.newPage();
      await participant.goto(buildFilloutPath(deriveQuestionnaireCode(created.id)));
      const sessionId = await startFormSession(participant);
      let card = await waitForCard(participant, 'text-input');
      await card.getByRole('textbox').fill('a');
      await expect(continueButton(participant)).toBeDisabled();
      await card.getByRole('textbox').fill('fullstack answer');
      await clickContinue(participant);
      card = await waitForCard(participant, 'single-choice');
      await expect(continueButton(participant)).toBeDisabled();
      await card.locator('.choice-label', { hasText: 'Banana' }).click();
      await clickContinue(participant);
      card = await waitForCard(participant, 'number-input');
      await card.locator('.number-input').fill('250');
      await expect(continueButton(participant)).toBeDisabled();
      await expect(card.locator('.number-input')).toHaveValue('250');
      await card.locator('.number-input').fill('7');
      await clickContinue(participant);
      await expect(participant.getByTestId('fillout-completion-screen')).toBeVisible({
        timeout: 30000,
      });
      await expect(participant.getByTestId('fillout-error')).toHaveCount(0);

      const responses = await pollSessionResponses(request, sessionId, workspace, 3);
      expect(responses).toHaveLength(3);
      expect(responses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ question_id: textId, value: 'fullstack answer' }),
          expect.objectContaining({ question_id: choiceId, value: 'banana' }),
          expect.objectContaining({ question_id: numberId, value: 7 }),
        ])
      );
      await expect
        .poll(async () => (await getSessionById(request, sessionId, workspace)).status, {
          timeout: 30000,
        })
        .toBe('completed');
      const session = await getSessionById(request, sessionId, workspace);
      expect(session).toMatchObject({
        questionnaire_id: created.id,
        questionnaire_version_major: created.version_major,
        questionnaire_version_minor: created.version_minor,
        questionnaire_version_patch: created.version_patch,
      });
    } finally {
      await participantContext.close();
    }
  });
});
