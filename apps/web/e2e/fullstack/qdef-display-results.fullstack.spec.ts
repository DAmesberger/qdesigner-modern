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
import { clickContinue, getResponses, startFormSession, waitForCard } from '../form/form-api';

test('@fullstack imported instructions and feedback display authored content and the participant score', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  const workspace = await provisionWorkspace(request);
  const questions: Record<string, unknown> = {
    score: {
      type: 'number-input',
      required: true,
      text: 'Your score',
      config: { min: 0, max: 10 },
      responseType: { type: 'number' },
    },
  };
  for (const type of ['text-display', 'text-instruction', 'instruction', 'media-display']) {
    questions[type] = {
      type,
      required: false,
      autoAdvance: false,
      display: { content: `Read the ${type} instructions`, enableMarkdown: true },
    };
  }
  questions.chart = {
    type: 'bar-chart',
    required: false,
    autoAdvance: false,
    config: { value: 'score', showValues: true },
    visualization: { title: 'Your authored chart' },
    dataSource: { variables: ['score'], aggregation: 'none' },
  };
  questions.feedback = {
    type: 'statistical-feedback',
    required: false,
    autoAdvance: false,
    config: {
      title: 'Your authored feedback',
      chartType: 'table',
      sourceMode: 'current-session',
      metric: 'mean',
      showSummary: true,
      dataSource: { source: 'variable', key: 'score', currentVariable: 'score' },
    },
  };
  const definition = {
    ...portableFormDefinition(`Display participant ${Date.now()}`),
    questions,
    structure: {
      pages: [
        {
          id: 'page',
          blocks: [{ id: 'block', type: 'standard', questionIds: Object.keys(questions) }],
        },
      ],
    },
  };
  await installAuthSession(page, workspace);
  await page.goto(`/projects/${workspace.projectId}`);
  await page.getByRole('button', { name: 'Import Definition', exact: true }).click();
  await page.getByTestId('qdef-file-input').setInputFiles({
    name: 'displays.qdef.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(definition)),
  });
  await expect(page.getByTestId('qdef-validation-heading')).toHaveText('Definition is valid');
  await page.getByRole('button', { name: 'Create Draft', exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${workspace.projectId}/designer/[^/]+$`));
  const designer = new DesignerPage(page);
  await designer.expectLoaded();
  await saveAndReload(designer);
  const questionnaireId = new URL(page.url()).pathname.split('/').at(-1)!;
  await publishInDesigner(designer);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const participant = await context.newPage();
    const errors: string[] = [];
    participant.on('pageerror', (error) => errors.push(error.message));
    await participant.goto(buildFilloutPath(deriveQuestionnaireCode(questionnaireId)));
    const sessionId = await startFormSession(participant);
    const card = await waitForCard(participant, 'number-input');
    await card.locator('.number-input').fill('7');
    await clickContinue(participant);
    for (const type of ['text-display', 'text-instruction', 'instruction', 'media-display']) {
      await expect(await waitForCard(participant, type)).toContainText(
        `Read the ${type} instructions`
      );
      await clickContinue(participant);
    }
    await expect(
      participant.getByRole('heading', { name: 'Your authored chart', exact: true })
    ).toBeVisible();
    await expect(
      participant.getByRole('img', { name: 'Bar chart. score: 7', exact: true })
    ).toBeVisible();
    await clickContinue(participant);
    await expect(
      participant.getByRole('heading', { name: 'Your authored feedback', exact: true })
    ).toBeVisible();
    await expect(participant.getByRole('cell', { name: '7', exact: true })).toBeVisible();
    await clickContinue(participant);
    await expect(participant.getByTestId('fillout-completion-screen')).toBeVisible();
    await expect
      .poll(async () =>
        (await getResponses(request, sessionId, workspace)).map((r) => ({
          questionId: r.question_id,
          value: r.value,
        }))
      )
      .toEqual([{ questionId: 'score', value: 7 }]);
    await expect
      .poll(async () => (await getSessionById(request, sessionId, workspace)).status)
      .toBe('completed');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
