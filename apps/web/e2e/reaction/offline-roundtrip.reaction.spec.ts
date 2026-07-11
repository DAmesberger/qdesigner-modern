import { expect, test } from './reaction-fixtures';
import {
  clickStartCaptureSession,
  filloutPath,
  getTrials,
  installPhaseHook,
  pollTrials,
  reactionTimeStudy,
  waitForStimulus,
} from '../helpers/reaction-api';

/**
 * RT-6 offline round-trip. A block seeded and started online keeps running after
 * the network drops mid-block — reaction trials execute entirely client-side and
 * persist to IndexedDB. When connectivity returns, the queued per-trial rows sync
 * and become readable server-side.
 */
test.describe('@reaction offline round-trip — trials survive a mid-block disconnect', () => {
  test.describe.configure({ timeout: 120000 });

  test('trials run offline and sync on reconnect', async ({
    page,
    context,
    request,
    workspace,
  }) => {
    const study = await reactionTimeStudy(request, workspace, { testTrials: 4 });

    await installPhaseHook(page);
    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();

    const sessionId = await clickStartCaptureSession(page);
    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({ timeout: 30000 });

    // First trial online.
    await waitForStimulus(page, 0);
    await page.waitForTimeout(80);
    await page.keyboard.press('f');

    // Drop the network mid-block; the remaining trials must still run.
    await context.setOffline(true);

    for (let index = 1; index < 4; index += 1) {
      await waitForStimulus(page, index);
      await page.waitForTimeout(80);
      await page.keyboard.press(index % 2 === 0 ? 'f' : 'j');
    }

    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });

    // While still offline, nothing has synced (the block ran from local state).
    const offlineTrials = await getTrials(request, sessionId, study.workspace);
    expect(offlineTrials.length).toBeLessThan(4);

    // Reconnect — the `online` event drives FilloutUploadSync to drain the queue.
    await context.setOffline(false);

    const trials = await pollTrials(request, sessionId, study.workspace, 4, 45000);
    expect(trials).toHaveLength(4);
    trials.sort((a, b) => a.trial_index - b.trial_index);
    for (const trial of trials) {
      expect(['left', 'right']).toContain(trial.option_id);
      expect(trial.source).toBe('keyboard');
    }
  });
});
