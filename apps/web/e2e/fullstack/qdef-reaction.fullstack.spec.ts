import { expect, test } from '@playwright/test';
import { DesignerPage } from '../page-objects/designer-page';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { portableFormDefinition } from '../helpers/qdef-form-fixture';
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
  pollSessionResponses,
  installAuthSession,
  provisionWorkspace,
} from '../helpers/fullstack-api';
import {
  clickStartCaptureSession,
  installPhaseHook,
  pollTrials,
  waitForStimulus,
} from '../helpers/reaction-api';

test.describe('@fullstack portable reaction designer to persisted trials', () => {
  test.describe.configure({ timeout: 180000 });
  test('authors, imports and publishes Standard RT with exact semantic responses and provenance', async ({
    page,
    request,
    browser,
  }) => {
    const workspace = await provisionWorkspace(request);
    const headers = { Cookie: `qd_session=${workspace.sessionCookie}` };
    const destination = await request.post('/api/projects', {
      headers: { ...headers, 'X-CSRF-Token': workspace.csrfToken },
      data: {
        organization_id: workspace.organizationId,
        name: 'Portable reaction destination',
        code: `reaction-copy-${Date.now()}`,
        is_public: true,
      },
    });
    expect(destination.status(), await destination.text()).toBe(201);
    const destinationId = (await destination.json()).id;
    const name = `Portable reaction acceptance ${Date.now()}`;
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
    const originalId = new URL(page.url()).pathname.split('/').at(-1)!;
    const exported = await request.get(
      `/api/projects/${workspace.projectId}/questionnaires/${originalId}/definition`,
      { headers }
    );
    expect(exported.status(), await exported.text()).toBe(200);
    const artifact = await exported.json();
    const definition = JSON.parse(artifact.canonical);
    expect(
      definition.questions[questionId].config.response.responseSet.options.map(
        (option: { id: string }) => option.id
      )
    ).toEqual(['left', 'right']);
    expect(definition.questions[questionId].config.response.correctOptionIds).toEqual(['left']);
    await page.goto(`/projects/${destinationId}`);
    await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
    await page.getByTestId('qdef-file-input').setInputFiles({
      name: 'reaction.qdef.json',
      mimeType: 'application/json',
      buffer: Buffer.from(artifact.canonical),
    });
    await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
    await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
    await page.waitForURL(new RegExp(`/projects/${destinationId}/designer/[^/]+$`));
    const imported = new DesignerPage(page);
    await imported.expectLoaded();
    const importedId = new URL(page.url()).pathname.split('/').at(-1)!;
    expect(importedId).not.toBe(originalId);
    await page.getByTestId(`designer-question-${questionId}`).click();
    await expect(page.getByTestId('responseset-option-0-id')).toHaveValue('left');
    await expect(page.getByTestId('responseset-option-0-correct')).toBeChecked();
    await expect(page.getByTestId('responseset-option-1-id')).toHaveValue('right');
    await saveAndReload(imported);
    const reread = await request.get(
      `/api/projects/${destinationId}/questionnaires/${importedId}/definition`,
      { headers }
    );
    expect(reread.status(), await reread.text()).toBe(200);
    const roundTrip = await reread.json();
    expect(roundTrip.canonical).toBe(artifact.canonical);
    expect(roundTrip.digest).toBe(artifact.digest);
    await publishInDesigner(imported);
    const created = (await listProjectQuestionnaires(request, destinationId, workspace)).find(
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

for (const type of ['webgl', 'reaction-experiment'] as const) {
  test(`@fullstack ${type} native edits survive exchange and produce participant results`, async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(240000);
    const workspace = await provisionWorkspace(request);
    const headers = { Cookie: `qd_session=${workspace.sessionCookie}` };
    const destination = await request.post('/api/projects', {
      headers: { ...headers, 'X-CSRF-Token': workspace.csrfToken },
      data: {
        organization_id: workspace.organizationId,
        name: `Imported ${type}`,
        code: `copy-${type}-${Date.now()}`,
        is_public: true,
      },
    });
    expect(destination.status(), await destination.text()).toBe(201);
    const destinationId = (await destination.json()).id;
    let designer: DesignerPage;
    let questionId: string;
    if (type === 'webgl') {
      // This retained low-level module is intentionally absent from the palette.
      // Its supported authoring entry is an imported draft.
      questionId = 'portable_webgl';
      const catalogue = JSON.parse(
        readFileSync(
          resolve(process.cwd(), '../../packages/questionnaire-core/src/module-catalogue.json'),
          'utf8'
        )
      );
      const definition = {
        ...portableFormDefinition(`WebGL exchange ${Date.now()}`),
        questions: {
          [questionId]: {
            type,
            required: true,
            responseType: { type: 'webgl' },
            config: catalogue.modules.webgl.defaultConfig.config,
          },
        },
        structure: {
          pages: [
            { id: 'page', blocks: [{ id: 'block', type: 'standard', questionIds: [questionId] }] },
          ],
        },
      };
      await installAuthSession(page, workspace);
      await page.goto(`/projects/${workspace.projectId}`);
      await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
      await page.getByTestId('qdef-file-input').setInputFiles({
        name: 'webgl.qdef.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(definition)),
      });
      await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
      await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
      await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/[^/]+$`));
      designer = new DesignerPage(page);
      await designer.expectLoaded();
      await page.getByTestId(`designer-question-${questionId}`).click();
    } else {
      designer = await createInDesigner(page, workspace, `${type} exchange ${Date.now()}`);
      questionId = await addModule(designer, type, 'portable_reaction');
    }
    if (type === 'webgl') {
      await page.getByLabel('Radius (px)', { exact: true }).fill('75');
      await page.getByLabel('Response Timeout (ms)', { exact: true }).fill('2500');
    } else {
      await page.getByRole('button', { name: 'Open Reaction Lab', exact: true }).click();
      const lab = page.getByTestId('reaction-lab-workspace');
      await expect(lab).toBeVisible();
      await lab.getByLabel('Prompt', { exact: true }).fill('Portable lab study');
      await lab.getByRole('button', { name: 'Randomizer', exact: true }).click();
      await lab.getByLabel('Seed', { exact: true }).fill('portable-lab-seed');
      await lab.getByRole('button', { name: 'Exit Lab', exact: true }).click();
    }
    await saveAndReload(designer);
    const originalId = new URL(page.url()).pathname.split('/').at(-1)!;
    const exported = await request.get(
      `/api/projects/${workspace.projectId}/questionnaires/${originalId}/definition`,
      { headers }
    );
    expect(exported.status(), await exported.text()).toBe(200);
    const artifact = await exported.json();
    const question = JSON.parse(artifact.canonical).questions[questionId];
    if (type === 'webgl') {
      expect(question.config.stimulus.content.properties.radius).toBe(75);
      expect(question.config.timing.responseDuration).toBe(2500);
    } else {
      expect(question.config.metadata.prompt).toBe('Portable lab study');
      expect(question.config.randomization.seed).toBe('portable-lab-seed');
    }
    await page.goto(`/projects/${destinationId}`);
    await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
    await page.getByTestId('qdef-file-input').setInputFiles({
      name: `${type}.qdef.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(artifact.canonical),
    });
    await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
    await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
    await page.waitForURL(new RegExp(`/projects/${destinationId}/designer/[^/]+$`));
    const imported = new DesignerPage(page);
    await imported.expectLoaded();
    const importedId = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.getByTestId(`designer-question-${questionId}`).click();
    if (type === 'webgl') {
      await expect(page.getByLabel('Radius (px)', { exact: true })).toHaveValue('75');
      await expect(page.getByLabel('Response Timeout (ms)', { exact: true })).toHaveValue('2500');
    } else {
      await page.getByRole('button', { name: 'Open Reaction Lab', exact: true }).click();
      const lab = page.getByTestId('reaction-lab-workspace');
      await expect(lab.getByLabel('Prompt', { exact: true })).toHaveValue('Portable lab study');
      await lab.getByRole('button', { name: 'Randomizer', exact: true }).click();
      await expect(lab.getByLabel('Seed', { exact: true })).toHaveValue('portable-lab-seed');
      await lab.getByRole('button', { name: 'Exit Lab', exact: true }).click();
    }
    await saveAndReload(imported);
    const reread = await request.get(
      `/api/projects/${destinationId}/questionnaires/${importedId}/definition`,
      { headers }
    );
    expect(reread.status(), await reread.text()).toBe(200);
    const exchanged = await reread.json();
    expect(exchanged.canonical).toBe(artifact.canonical);
    expect(exchanged.digest).toBe(artifact.digest);
    await publishInDesigner(imported);

    const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const participant = await context.newPage();
      const errors: string[] = [];
      participant.on('pageerror', (error) => errors.push(error.message));
      await installPhaseHook(participant);
      await participant.goto(buildFilloutPath(deriveQuestionnaireCode(importedId)));
      const sessionId = await clickStartCaptureSession(participant);
      const trialCount =
        type === 'webgl'
          ? 1
          : question.config.blocks.reduce(
              (sum: number, block: { repetitions?: number; trials: Array<{ repeat?: number }> }) =>
                sum +
                (block.repetitions ?? 1) *
                  block.trials.reduce((n, trial) => n + (trial.repeat ?? 1), 0),
              0
            );
      for (let index = 0; index < trialCount; index++) {
        await waitForStimulus(participant, index);
        await participant.waitForTimeout(120);
        await participant.keyboard.press('f');
      }
      await expect(participant.getByTestId('fillout-completion-screen')).toBeVisible({
        timeout: 30000,
      });
      const responses = await pollSessionResponses(request, sessionId, workspace, 1);
      expect(responses).toHaveLength(1);
      expect(responses[0]?.question_id).toBe(questionId);
      if (type === 'webgl') {
        expect(responses[0]?.value).toMatchObject({ response: 'f', timeout: false });
      } else {
        expect(responses[0]?.value).toMatchObject({ timeouts: 0 });
        const trials = await pollTrials(request, sessionId, workspace, trialCount);
        expect(trials).toHaveLength(trialCount);
        for (const trial of trials) {
          expect(trial.question_id).toBe(questionId);
          expect(trial.source).toBe('keyboard');
          expect(trial.rt_us).toBeGreaterThan(0);
          expect(trial.provenance).toMatchObject({ onsetMethod: 'raf', crossOriginIsolated: true });
        }
      }
      await expect
        .poll(async () => (await getSessionById(request, sessionId, workspace)).status)
        .toBe('completed');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
