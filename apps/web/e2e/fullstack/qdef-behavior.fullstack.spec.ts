import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  provisionWorkspace,
  installAuthSession,
  buildFilloutPath,
  deriveQuestionnaireCode,
  getSessionById,
} from '../helpers/fullstack-api';
import { saveAndReload, publishInDesigner } from '../helpers/designer-authoring';
import { portableBehaviorDefinition } from '../helpers/qdef-behavior-fixture';
import { DesignerPage } from '../page-objects/designer-page';
import { clickContinue, waitForCard, pollResponses } from '../form/form-api';

test('@fullstack portable behavior survives designer publication and produces consent, translated answers, scores and a distinct screen-out', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const workspace = await provisionWorkspace(request);
  const definition = portableBehaviorDefinition(`Portable behavior ${Date.now()}`);
  await installAuthSession(page, workspace);
  await page.goto(`/projects/${workspace.projectId}`);
  await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
  const inspected = page.waitForResponse(
    (r) => r.url().endsWith('/questionnaire-definitions/dry-run') && r.ok()
  );
  await page.getByTestId('qdef-file-input').setInputFiles({
    name: 'behavior.qdef.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(definition)),
  });
  const preview = await (await inspected).json();
  expect(preview.valid, JSON.stringify(preview.diagnostics)).toBe(true);
  await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
  await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/[^/]+$`));
  const designer = new DesignerPage(page);
  await designer.expectLoaded();
  await saveAndReload(designer);
  const questionnaireId = new URL(page.url()).pathname.split('/').at(-1)!;
  const exported = await request.get(
    `/api/projects/${workspace.projectId}/questionnaires/${questionnaireId}/definition`,
    {
      headers: { Cookie: `qd_session=${workspace.sessionCookie}` },
    }
  );
  expect(exported.status(), await exported.text()).toBe(200);
  expect((await exported.json()).digest).toBe(preview.digest);
  await publishInDesigner(designer);

  for (const age of [28, 16]) {
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const participant = await context.newPage();
      participant.setDefaultTimeout(15000);
      const errors: string[] = [];
      participant.on('pageerror', (error) => errors.push(error.message));
      await participant.goto(buildFilloutPath(deriveQuestionnaireCode(questionnaireId)));
      await participant
        .getByTestId('fillout-language-picker')
        .getByRole('button', { name: 'Deutsch', exact: true })
        .click();
      await participant.getByTestId('fillout-start-button').click();
      await expect(participant.getByTestId('fillout-consent-title')).toHaveText('Study consent');
      // The incomplete form advertises aria-disabled but intentionally handles
      // clicks to explain missing consent. Exercise that validation interaction.
      await participant.getByTestId('fillout-consent-accept-button').click({ force: true });
      await expect(
        participant.getByTestId('fillout-consent-screen').getByRole('alert')
      ).toBeVisible();
      await participant.getByLabel('I consent to this study').check();
      await participant.getByTestId('fillout-consent-signature').fill(`Participant ${age}`);
      const sessionCreated = participant.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/sessions' &&
          r.request().method() === 'POST' &&
          r.status() === 201
      );
      await participant.getByTestId('fillout-consent-accept-button').click();
      const sessionId: string = (await (await sessionCreated).json()).id;
      let card = await waitForCard(participant, 'number-input');
      await expect(card).toContainText('Ihr Alter');
      await card.locator('.number-input').fill(String(age));
      await clickContinue(participant);
      if (age >= 18) {
        card = await waitForCard(participant, 'scale');
        await expect(card).toContainText('Ich fühle mich wohl');
        await card.getByRole('radio', { name: '5', exact: true }).click();
        await clickContinue(participant);
        card = await waitForCard(participant, 'scale');
        await expect(card).toContainText('Ich fühle mich müde');
        await card.getByRole('radio', { name: '3', exact: true }).click();
        await clickContinue(participant);
        await expect(participant.getByTestId('fillout-completion-screen')).toBeVisible();
        await expect(participant.getByTestId('fillout-report-title')).toHaveText(
          'Your study results'
        );
        await expect(participant.getByTestId('report-widget-score-tile')).toContainText('4.00');
        await expect(participant.getByTestId('report-pdf-download')).toBeVisible();
        const downloaded = participant.waitForEvent('download');
        await participant.getByTestId('report-pdf-download').click();
        const download = await downloaded;
        expect(await download.failure()).toBeNull();
        expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        const bytes = await readFile((await download.path())!);
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(bytes.toString('latin1')).toContain('Wellbeing score');
      } else {
        await expect(participant.getByTestId('fillout-screened-out-screen')).toContainText(
          'This study is for adults only.'
        );
        await expect(participant.getByTestId('fillout-report-page')).toHaveCount(0);
      }
      const responses = await pollResponses(request, sessionId, workspace, age >= 18 ? 3 : 1);
      expect(Object.fromEntries(responses.map((r) => [r.question_id, r.value]))).toEqual(
        age >= 18 ? { age: 28, positive: 5, negative: 3 } : { age: 16 }
      );
      expect(responses).toHaveLength(age >= 18 ? 3 : 1);
      await expect
        .poll(async () => (await getSessionById(request, sessionId, workspace)).status)
        .toBe('completed');
      const stored = await getSessionById(request, sessionId, workspace);
      expect(stored).toMatchObject({
        questionnaire_id: questionnaireId,
        questionnaire_version_major: 2,
        questionnaire_version_minor: 3,
        questionnaire_version_patch: 4,
        metadata: {
          consent: { accepted: true, checkboxes: { agree: true }, signature: `Participant ${age}` },
        },
      });
      const variablesResponse = await request.get(`/api/sessions/${sessionId}/variables`, {
        headers: { Cookie: `qd_session=${workspace.sessionCookie}` },
      });
      expect(variablesResponse.status(), await variablesResponse.text()).toBe(200);
      const variables: { variable_name: string; variable_value: unknown }[] =
        await variablesResponse.json();
      if (age >= 18) {
        expect(
          variables.find((v) => v.variable_name === 'score.wellbeing')?.variable_value
        ).toMatchObject({
          value: 4,
          z: 1,
          tScore: 60,
          itemsAnswered: 2,
          itemsExpected: 2,
        });
        expect(stored.metadata.screenOut).toBeUndefined();
      } else {
        expect(
          variables.find((v) => v.variable_name === 'score.wellbeing')?.variable_value
        ).toMatchObject({ value: null, itemsAnswered: 0, itemsExpected: 2 });
        await expect
          .poll(
            async () => (await getSessionById(request, sessionId, workspace)).metadata.screenOut,
            { timeout: 30000 }
          )
          .toMatchObject({ reason: 'under-age', ruleId: 'adults-only' });
      }
      await expect
        .poll(
          async () => (await getSessionById(request, sessionId, workspace)).metadata.qualityReport,
          { timeout: 30000 }
        )
        .toBeDefined();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
  await expect
    .poll(async () => {
      const response = await request.get(
        `/api/sessions/aggregate?questionnaire_id=${questionnaireId}&source=variable&key=score.wellbeing.value`,
        {
          headers: { Cookie: `qd_session=${workspace.sessionCookie}` },
        }
      );
      expect(response.status(), await response.text()).toBe(200);
      const body = await response.json();
      return body.stats;
    })
    .toMatchObject({ sample_count: 1, mean: 4 });
});
