import { expect, test } from './reaction-fixtures';
import {
  clickStartCaptureSession,
  filloutPath,
  getTrials,
  installPhaseHook,
  pollTrials,
  reactionExperimentImageStudy,
} from '../helpers/reaction-api';

/**
 * RT-6 preload fail-closed (ADR 0026). A reaction-experiment block whose image
 * stimulus cannot be prepared must REFUSE to run: the participant sees an honest,
 * retryable media-error state and NO trial is ever timed against a blank screen.
 * On retry with the asset reachable, the block runs and persists a trial.
 *
 * NOTE ON THE FAIL-CLOSED LAYER. Empirically, an unloadable reaction asset is
 * caught by the fillout runtime's media-preload guard (`fillout-media-error` +
 * `fillout-media-retry`), which fires BEFORE the engine's Layer-2 decode gate — so
 * this spec asserts the reachable participant-facing contract (honest refusal +
 * zero trials + working retry) rather than the engine's `gate-preparing`/
 * `gate-failed` phases, which are unit-tested in ReactionEngine and only surface
 * for assets that pass preload but fail decode inside a running block. A `503`
 * (fast error) exercises the same fail-closed path as a hang, without the wait.
 */
test.describe('@reaction preload fail-closed — unpreparable media never yields a trial', () => {
  test.describe.configure({ timeout: 120000 });

  test('media error blocks the block, then retry runs it', async ({
    page,
    request,
    workspace,
  }) => {
    const study = await reactionExperimentImageStudy(request, workspace);

    // Fail every media-content request until the retry restores it.
    let mediaBlocked = true;
    await page.route('**/api/media/*/content', (route) => {
      if (mediaBlocked) {
        void route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
        return;
      }
      void route.continue();
    });

    await installPhaseHook(page);
    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible({ timeout: 30000 });

    const sessionId = await clickStartCaptureSession(page);

    // Fail-closed UI: an honest, retryable media-error rather than a blank timed block.
    await expect(page.getByTestId('fillout-media-error')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('fillout-media-retry')).toBeVisible();

    // Fail-closed data guarantee: nothing was recorded while the stimulus was missing.
    const duringFailure = await getTrials(request, sessionId, study.workspace);
    expect(duringFailure).toHaveLength(0);

    // Restore the asset and retry — the block runs to completion this time.
    mediaBlocked = false;
    await page.getByTestId('fillout-media-retry').click();

    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });

    const trials = await pollTrials(request, sessionId, study.workspace, 1);
    expect(trials.length).toBeGreaterThanOrEqual(1);
    expect(trials[0]!.invalidated).toBeNull();
  });
});
