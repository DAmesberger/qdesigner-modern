import { expect, test } from './reaction-fixtures';
import {
  clickStartCaptureSession,
  filloutPath,
  installPhaseHook,
  pollTrials,
  reactionTimeStudy,
  waitForStimulus,
} from '../helpers/reaction-api';

/**
 * RT-6 golden path. Seed a standard RT study (Left→f correct / Right→j, 4 test
 * trials) via the API, run the real fillout driving trusted keyboard input off the
 * engine's phase hook, then assert the server-side per-trial rows: count, semantic
 * option ids, correctness per press, plausible microsecond RT, and complete timing
 * provenance. Timing assertions are STRUCTURAL (broad bands) — no precision claim.
 */
test.describe('@reaction golden path — trusted input → server-side trial rows', () => {
  test.describe.configure({ timeout: 120000 });

  test('four presses produce four scored trials with provenance', async ({
    page,
    request,
    workspace,
  }) => {
    const study = await reactionTimeStudy(request, workspace, { testTrials: 4 });

    await installPhaseHook(page);
    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();

    const sessionId = await clickStartCaptureSession(page);
    expect(sessionId).toBeTruthy();
    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({ timeout: 30000 });

    // f → option `left` (correct), j → option `right` (incorrect). Alternate so
    // the row-level correctness assertion has both truth values.
    const presses = ['f', 'j', 'f', 'j'];
    const expectedCorrect = [true, false, true, false];

    for (let index = 0; index < presses.length; index += 1) {
      await waitForStimulus(page, index);
      // A small deliberate latency keeps RT clear of the 50 ms lower band and well
      // inside the response window.
      await page.waitForTimeout(120);
      await page.keyboard.press(presses[index]!);
    }

    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('fillout-error')).toHaveCount(0);

    const trials = await pollTrials(request, sessionId, study.workspace, 4);
    expect(trials).toHaveLength(4);

    // Ordered by trial_index; assert the per-trial contract.
    trials.sort((a, b) => a.trial_index - b.trial_index);
    trials.forEach((trial, index) => {
      expect(['left', 'right']).toContain(trial.option_id);
      expect(trial.option_id).toBe(presses[index] === 'f' ? 'left' : 'right');
      expect(trial.source).toBe('keyboard');
      expect(trial.correct).toBe(expectedCorrect[index]);
      expect(trial.invalidated).toBeNull();

      // rt_us in [50 ms, 2.5 s] as microseconds.
      expect(trial.rt_us).not.toBeNull();
      expect(trial.rt_us!).toBeGreaterThanOrEqual(50_000);
      expect(trial.rt_us!).toBeLessThanOrEqual(2_500_000);

      // Provenance: raf onset, event.timeStamp response, and the run was actually
      // cross-origin isolated. The last one is a hard `true`, not a type check:
      // without COOP/COEP the browser clamps `performance.now()` from ~5µs to
      // ~100µs, and per ADR 0027 the run still completes and merely records the
      // degradation — so a `typeof === 'boolean'` assertion would stay green on a
      // 20x-degraded product. The dev server this lane runs against IS isolated
      // (`hooks.server.ts`), so anything but `true` is a real regression.
      expect(trial.provenance).not.toBeNull();
      expect(trial.provenance!.onsetMethod).toBe('raf');
      expect(trial.provenance!.responseMethod).toBe('event.timeStamp');
      expect(trial.provenance!.crossOriginIsolated).toBe(true);
    });
  });
});
