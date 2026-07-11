import { expect, test } from './reaction-fixtures';
import {
  clickStartCaptureSession,
  filloutPath,
  installPhaseHook,
  reactionTimeStudy,
  waitForStimulus,
} from '../helpers/reaction-api';

/**
 * RT-6 / W-1 regression. If `AudioContext.resume()` never settles (a real
 * mobile/iOS audio state), an un-timed await in `primeAudio` would deadlock
 * `prepare() → run()` and the block would never start. The engine races resume
 * against a 500 ms timeout, so the block must still reach its first stimulus.
 */
test.describe('@reaction W-1 — hung audio resume still starts the block', () => {
  test.describe.configure({ timeout: 120000 });

  test('a never-settling AudioContext.resume does not block trial start', async ({
    page,
    request,
    workspace,
  }) => {
    const study = await reactionTimeStudy(request, workspace, { testTrials: 1 });

    // Force resume() to hang before any app script constructs an AudioContext.
    await page.addInitScript(() => {
      for (const ctor of [
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext,
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
      ]) {
        if (ctor?.prototype) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only override
          (ctor.prototype as any).resume = () => new Promise<void>(() => {});
        }
      }
    });
    await installPhaseHook(page);

    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();

    await clickStartCaptureSession(page);
    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({ timeout: 30000 });

    // The 500 ms resume timeout must let onset fire; allow generous headroom.
    await waitForStimulus(page, 0, 5000);

    // Complete the single trial so the session tears down cleanly.
    await page.keyboard.press('f');
    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
  });
});
