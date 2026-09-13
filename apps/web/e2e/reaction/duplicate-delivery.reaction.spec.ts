import { expect, test } from './reaction-fixtures';
import {
  clickStartCaptureSession,
  filloutPath,
  installPhaseHook,
  pollTrials,
  reactionTimeStudy,
  waitForStimulus,
} from '../helpers/reaction-api';
import { getSessionById } from '../helpers/fullstack-api';

test('@reaction a lost acknowledgement retries committed trials without duplicating results', async ({
  page,
  request,
  workspace,
}) => {
  test.setTimeout(90000);
  const study = await reactionTimeStudy(request, workspace, { testTrials: 2 });
  await installPhaseHook(page);
  await page.goto(filloutPath(study.questionnaireCode));
  const sessionId = await clickStartCaptureSession(page);
  let deliveries = 0;
  await page.route(`**/api/sessions/${sessionId}/sync`, async (route) => {
    if (route.request().postDataJSON().trials?.length) {
      deliveries++;
      if (deliveries === 1) {
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
        await route.abort('connectionreset');
        return;
      }
    }
    await route.continue();
  });
  for (const [index, key] of ['f', 'j'].entries()) {
    await waitForStimulus(page, index);
    await page.waitForTimeout(120);
    await page.keyboard.press(key);
  }
  await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => deliveries, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
  const trials = await pollTrials(request, sessionId, workspace, 2);
  expect(trials).toHaveLength(2);
  expect(new Set(trials.map((t) => t.client_id)).size).toBe(2);
  trials.sort((a, b) => a.trial_index - b.trial_index);
  expect(trials.map((t) => [t.trial_index, t.option_id, t.correct])).toEqual([
    [1, 'left', true],
    [2, 'right', false],
  ]);
  await expect
    .poll(async () => (await getSessionById(request, sessionId, workspace)).status)
    .toBe('completed');
});
