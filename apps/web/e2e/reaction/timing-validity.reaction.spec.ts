import { expect, test } from './reaction-fixtures';
import {
  buildReactionTimeDefinition,
  clickStartCaptureSession,
  filloutPath,
  installPhaseHook,
  pollTrials,
  publishDefinition,
  waitForStimulus,
} from '../helpers/reaction-api';

for (const policy of ['record', 'enforce'] as const) {
  test(`@reaction ${policy} policy handles a browser without cross-origin isolation`, async ({
    page,
    request,
    workspace,
  }) => {
    test.setTimeout(90000);
    const definition = buildReactionTimeDefinition({ testTrials: 1 });
    Object.assign(definition.settings, { validityPolicy: policy });
    const study = await publishDefinition(request, workspace, definition);
    // Deliver the real document without isolation headers. The browser's real
    // crossOriginIsolated capability changes; no timing/provenance values are injected.
    await page.route('**/q/**', async (route) => {
      if (!route.request().isNavigationRequest()) return route.continue();
      const response = await route.fetch();
      const headers = response.headers();
      delete headers['cross-origin-opener-policy'];
      delete headers['cross-origin-embedder-policy'];
      await route.fulfill({ response, headers });
    });
    await installPhaseHook(page);
    await page.goto(filloutPath(study.questionnaireCode));
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    if (policy === 'enforce') {
      let createdSessions = 0;
      page.on('request', (req) => {
        if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/sessions')
          createdSessions++;
      });
      await page.getByTestId('fillout-start-button').click();
      await expect(page.getByTestId('fillout-timing-isolation-required')).toBeVisible();
      expect(createdSessions).toBe(0);
      await expect(page.getByTestId('fillout-runtime-canvas')).toHaveCount(0);
    } else {
      const sessionId = await clickStartCaptureSession(page);
      await waitForStimulus(page, 0);
      await page.waitForTimeout(120);
      await page.keyboard.press('f');
      await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
      const trials = await pollTrials(request, sessionId, workspace, 1);
      expect(trials).toHaveLength(1);
      expect(trials[0]).toMatchObject({
        option_id: 'left',
        correct: true,
        provenance: {
          crossOriginIsolated: false,
          onsetMethod: 'raf',
          responseMethod: 'event.timeStamp',
        },
      });
    }
  });
}
