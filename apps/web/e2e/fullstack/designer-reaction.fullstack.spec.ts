import { expect, test } from '@playwright/test';
import {
  addModule,
  createInDesigner,
  publishInDesigner,
  saveAndReload,
} from '../helpers/designer-authoring';
import {
  buildFilloutPath,
  deriveQuestionnaireCode,
  getSessionById,
  listProjectQuestionnaires,
  provisionWorkspace,
} from '../helpers/fullstack-api';
import {
  clickStartCaptureSession,
  installPhaseHook,
  pollTrials,
  waitForStimulus,
} from '../helpers/reaction-api';

test.describe('@fullstack reaction designer to persisted trials', () => {
  test.describe.configure({ timeout: 180000 });
  test('authors Standard RT with semantic bindings, reloads, and records correct, incorrect and timeout trials', async ({
    page,
    request,
    browser,
  }) => {
    const workspace = await provisionWorkspace(request);
    const name = `UI reaction acceptance ${Date.now()}`;
    const designer = await createInDesigner(page, workspace, name);
    const questionId = await addModule(designer, 'reaction-time', 'reaction_acceptance');
    await page.getByLabel('Paradigm', { exact: true }).selectOption('standard');
    await page.getByLabel('Include practice trials').uncheck();
    await page.getByLabel('Number of Test Trials').fill('3');
    await page.getByLabel('Response Timeout (ms)', { exact: true }).fill('1500');
    await page.getByLabel('Fixation Duration (ms)', { exact: true }).fill('50');
    const keyPreset = page.getByTestId('reaction-response-key-preset').getByRole('combobox');
    await keyPreset.selectOption('F/J');
    await page
      .getByTestId('reaction-response-key-preset')
      .getByRole('button', { name: 'Apply', exact: true })
      .click();
    await page.getByRole('button', { name: 'Customize response set' }).click();
    await page.getByTestId('responseset-option-0-label').fill('Left');
    await page.getByTestId('responseset-option-0-id').fill('left');
    await page.getByTestId('responseset-option-0-correct').check();
    await page.getByTestId('responseset-option-1-label').fill('Right');
    await page.getByTestId('responseset-option-1-id').fill('right');
    await page.getByTestId('responseset-option-1-correct').uncheck();
    await saveAndReload(designer);
    await page.getByTestId(`designer-question-${questionId}`).click();
    await expect(page.getByTestId('designer-question-internal-name')).toHaveValue(
      'reaction_acceptance'
    );
    await expect(page.getByLabel('Number of Test Trials')).toHaveValue('3');
    await expect(page.getByLabel('Include practice trials')).not.toBeChecked();
    await expect(page.getByLabel('Response Timeout (ms)', { exact: true })).toHaveValue('1500');
    await expect(page.getByTestId('responseset-option-0-id')).toHaveValue('left');
    await expect(page.getByTestId('responseset-option-0-binding-0-key')).toHaveText('F');
    await expect(page.getByTestId('responseset-option-0-correct')).toBeChecked();
    await expect(page.getByTestId('responseset-option-1-id')).toHaveValue('right');
    await expect(page.getByTestId('responseset-option-1-binding-0-key')).toHaveText('J');
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
      await installPhaseHook(participant);
      await participant.goto(buildFilloutPath(deriveQuestionnaireCode(created.id)));
      const sessionId = await clickStartCaptureSession(participant);
      for (const [index, key] of ['f', 'j'].entries()) {
        await waitForStimulus(participant, index);
        // Respond after presentation, allowing the estimated display latency to
        // elapse. This is a stimulus-response delay, not a sync/rate workaround.
        await participant.waitForTimeout(120);
        await participant.keyboard.press(key);
      }
      await waitForStimulus(participant, 2); // Deliberately withhold a response on the third trial.
      await expect(participant.getByTestId('fillout-completion-screen')).toBeVisible({
        timeout: 30000,
      });
      const trials = await pollTrials(request, sessionId, workspace, 3);
      expect(trials).toHaveLength(3);
      trials.sort((a, b) => a.trial_index - b.trial_index);
      expect(trials.map((t) => t.trial_index)).toEqual([1, 2, 3]);
      expect(trials.map((t) => t.option_id)).toEqual(['left', 'right', null]);
      expect(trials.map((t) => t.correct)).toEqual([true, false, false]);
      expect(new Set(trials.map((t) => t.client_id)).size).toBe(3);
      for (const trial of trials) {
        expect(trial.question_id).toBe(questionId);
        expect(trial.invalidated).toBeNull();
        expect(trial.provenance).toMatchObject({ onsetMethod: 'raf', crossOriginIsolated: true });
      }
      for (const trial of trials.slice(0, 2)) {
        expect(trial.source).toBe('keyboard');
        expect(trial.rt_us).toBeGreaterThanOrEqual(50_000);
        expect(trial.provenance?.rawRtMs).toBeGreaterThanOrEqual(50);
        expect(trial.rt_us).toBeLessThanOrEqual(1_500_000);
        expect(trial.provenance?.responseMethod).toBe('event.timeStamp');
      }
      expect(trials[2]!.rt_us).toBeNull();
      await expect
        .poll(async () => (await getSessionById(request, sessionId, workspace)).status, {
          timeout: 30000,
        })
        .toBe('completed');
      expect(await getSessionById(request, sessionId, workspace)).toMatchObject({
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
