import { expect, test } from '@playwright/test';
import {
  installAuthSession,
  provisionWorkspace,
  deriveQuestionnaireCode,
  buildFilloutPath,
  getSessionById,
} from '../helpers/fullstack-api';
import { publishInDesigner, saveAndReload } from '../helpers/designer-authoring';
import { portableFormDefinition } from '../helpers/qdef-form-fixture';
import { DesignerPage } from '../page-objects/designer-page';
import {
  clickContinue,
  continueButton,
  drawStroke,
  pollUploadedResponses,
  responseFor,
  startFormSession,
  waitForCard,
} from '../form/form-api';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test('@fullstack an imported form preserves configuration and persists exact answers, uploads and a real browser recording', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  const workspace = await provisionWorkspace(request);
  const definition = portableFormDefinition(`Imported participant form ${Date.now()}`);
  await installAuthSession(page, workspace);
  await page.goto(`/projects/${workspace.projectId}`);
  await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
  const inspected = page.waitForResponse(
    (r) => r.url().endsWith('/questionnaire-definitions/dry-run') && r.ok()
  );
  await page.getByTestId('qdef-file-input').setInputFiles({
    name: 'participant.qdef.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(definition)),
  });
  const preview = await (await inspected).json();
  await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
  await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/[^/]+$`));
  const designer = new DesignerPage(page);
  await designer.expectLoaded();
  await saveAndReload(designer);
  const questionnaireId = new URL(page.url()).pathname.split('/').at(-1)!;
  const headers = { Cookie: `qd_session=${workspace.sessionCookie}` };
  const exported = await request.get(
    `/api/projects/${workspace.projectId}/questionnaires/${questionnaireId}/definition`,
    { headers }
  );
  expect(exported.status(), await exported.text()).toBe(200);
  expect((await exported.json()).digest).toBe(preview.digest);
  await page.getByTestId('designer-question-number').click();
  await page.getByLabel('Minimum', { exact: true }).fill('');
  await saveAndReload(designer);
  const edited = await request.get(
    `/api/projects/${workspace.projectId}/questionnaires/${questionnaireId}/definition`,
    { headers }
  );
  expect(edited.status(), await edited.text()).toBe(200);
  const number = JSON.parse((await edited.json()).canonical).questions.number;
  expect(number.display?.min).toBeUndefined();
  expect(number.responseType?.min).toBeUndefined();
  expect(number.config).toMatchObject({ max: 10, step: 1 });
  await publishInDesigner(designer);

  const participantContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    timezoneId: 'UTC',
    permissions: ['microphone'],
  });
  try {
    const participant = await participantContext.newPage();
    const errors: string[] = [];
    participant.on('pageerror', (error) => errors.push(error.message));
    participant.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /Failed to persist|Error saving variable|DataCloneError/.test(message.text())
      ) {
        errors.push(message.text());
      }
    });
    await participant.goto(buildFilloutPath(deriveQuestionnaireCode(questionnaireId)));
    const sessionId = await startFormSession(participant);
    let card = await waitForCard(participant, 'text-input');
    await expect(card).not.toContainText('This must be skipped');
    await card.getByRole('textbox').fill('a');
    await expect(continueButton(participant)).toBeDisabled();
    await card.getByRole('textbox').fill('Portable answer');
    await clickContinue(participant);
    card = await waitForCard(participant, 'number-input');
    await card.locator('.number-input').fill('0');
    await clickContinue(participant);
    card = await waitForCard(participant, 'single-choice');
    await card.locator('.choice-label', { hasText: 'Banana' }).click();
    await clickContinue(participant);
    card = await waitForCard(participant, 'multiple-choice');
    await card.locator('.choice-label', { hasText: 'Red' }).click();
    await expect(continueButton(participant)).toBeDisabled();
    await card.locator('.choice-label', { hasText: 'Blue' }).click();
    await clickContinue(participant);
    card = await waitForCard(participant, 'scale');
    await card.getByRole('radio', { name: '5 Agree', exact: true }).click();
    await clickContinue(participant);
    card = await waitForCard(participant, 'rating');
    await card.getByRole('button', { name: 'Rate 4 out of 5' }).click();
    await clickContinue(participant);
    card = await waitForCard(participant, 'matrix');
    await card.locator('input[type=radio]').nth(1).check({ force: true });
    await expect(continueButton(participant)).toBeDisabled();
    await card.locator('input[type=radio]').nth(2).check({ force: true });
    await clickContinue(participant);
    card = await waitForCard(participant, 'ranking');
    for (let i = 0; i < 3; i++)
      await card.getByRole('button', { name: 'Add to ranking' }).first().click();
    await clickContinue(participant);
    card = await waitForCard(participant, 'date-time');
    await card.locator('input[type=date]').fill('2026-07-15');
    await clickContinue(participant);
    card = await waitForCard(participant, 'drawing');
    await drawStroke(participant, card.locator('.drawing-canvas'));
    await clickContinue(participant);
    card = await waitForCard(participant, 'file-upload');
    const uploadedBytes = Buffer.from('Portable upload\n');
    await card
      .locator('input[type=file]')
      .setInputFiles({ name: 'answer.txt', mimeType: 'text/plain', buffer: uploadedBytes });
    await clickContinue(participant);
    card = await waitForCard(participant, 'media-response');
    await card.getByRole('button', { name: 'Record Audio', exact: true }).click();
    await expect(card.getByTestId('recording-duration')).toHaveText(/^0:0[1-9]$/);
    await card.getByRole('button', { name: 'Stop Recording', exact: true }).click();
    await clickContinue(participant);
    await expect(participant.getByTestId('fillout-completion-screen')).toBeVisible({
      timeout: 30000,
    });
    await expect(participant.getByTestId('fillout-error')).toHaveCount(0);
    const responses = await pollUploadedResponses(request, sessionId, workspace, [
      'upload',
      'recording',
    ]);
    expect(responses).toHaveLength(12);
    expect(responses.some((r) => r.question_id === 'hidden')).toBe(false);
    for (const [id, value] of Object.entries({
      text: 'Portable answer',
      number: 0,
      single: 'banana',
      multiple: ['red', 'blue'],
      scale: 5,
      rating: 4,
      matrix: { taste: 2, texture: 1 },
      ranking: ['third', 'first', 'second'],
      date: '2026-07-15T00:00:00.000Z',
    })) {
      expect(responseFor(responses, id).value).toEqual(value);
    }
    expect(responseFor(responses, 'drawing').value).toMatchObject({
      imageData: expect.stringMatching(/^data:image\/png;base64,/),
    });
    expect(responseFor(responses, 'upload').value).toMatchObject({
      name: 'answer.txt',
      size: uploadedBytes.length,
      mimeType: 'text/plain',
      status: 'uploaded',
    });
    const recording = responseFor(responses, 'recording').value as {
      duration: number;
      size: number;
      mimeType: string;
      status: string;
      mediaUrl: string;
    };
    expect(recording.status).toBe('uploaded');
    expect(recording.mimeType).toMatch(/^audio\/webm/);
    expect(recording.duration).toBeGreaterThanOrEqual(1);
    expect(recording.size).toBeGreaterThan(0);
    expect(recording.mediaUrl).toBeTruthy();
    await expect
      .poll(async () => (await getSessionById(request, sessionId, workspace)).status)
      .toBe('completed');
    expect(await getSessionById(request, sessionId, workspace)).toMatchObject({
      questionnaire_id: questionnaireId,
      questionnaire_version_major: 2,
      questionnaire_version_minor: 1,
      questionnaire_version_patch: 0,
    });
    expect(errors).toEqual([]);
  } finally {
    await participantContext.close();
  }
});
