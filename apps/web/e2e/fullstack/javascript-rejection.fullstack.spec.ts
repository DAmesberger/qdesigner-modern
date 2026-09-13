import { expect, test } from '@playwright/test';
import { buildReactionTimeDefinition, publishDefinition } from '../helpers/reaction-api';
import { buildFilloutPath, installAuthSession, provisionWorkspace } from '../helpers/fullstack-api';

const marker = 'globalThis.__authoredJavaScriptExecuted = true';

for (const location of ['root', 'page', 'question'] as const) {
  test(`@fullstack rejects existing JavaScript at ${location} before authoring or participation`, async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(90000);
    const workspace = await provisionWorkspace(request);
    const definition = buildReactionTimeDefinition({ testTrials: 1 });
    if (location === 'root') Object.assign(definition, { scripts: { onInit: marker } });
    if (location === 'page') Object.assign(definition.pages[0]!, { script: marker });
    if (location === 'question')
      Object.assign(definition.questions[0]!, { settings: { script: marker } });
    const study = await publishDefinition(request, workspace, definition);
    await installAuthSession(page, workspace);
    await page.goto(`/projects/${workspace.projectId}/designer/${study.questionnaireId}`);
    await expect(page.getByTestId('designer-load-error')).toContainText('UNSAFE_JAVASCRIPT');
    await expect(page.getByTestId('designer-publish-button')).toHaveCount(0);
    expect(
      await page.evaluate(() => Reflect.get(globalThis, '__authoredJavaScriptExecuted'))
    ).toBeUndefined();

    const participantContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const participant = await participantContext.newPage();
      await participant.goto(buildFilloutPath(study.questionnaireCode));
      await participant.getByTestId('fillout-start-button').click();
      await expect(participant.getByTestId('fillout-error')).toContainText('UNSAFE_JAVASCRIPT');
      await expect(participant.getByTestId('fillout-completion-screen')).toHaveCount(0);
      expect(
        await participant.evaluate(() => Reflect.get(globalThis, '__authoredJavaScriptExecuted'))
      ).toBeUndefined();
    } finally {
      await participantContext.close();
    }
    // Opening an obsolete definition must not autosave a silently stripped copy.
    const response = await request.get(
      `/api/projects/${workspace.projectId}/questionnaires/${study.questionnaireId}`,
      {
        headers: { Cookie: `qd_session=${workspace.sessionCookie}` },
      }
    );
    expect(response.ok()).toBe(true);
    expect(JSON.stringify(await response.json())).toContain(marker);
  });
}
