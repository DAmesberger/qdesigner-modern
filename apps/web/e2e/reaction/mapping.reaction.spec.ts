import { expect, test } from './reaction-fixtures';
import {
  clickStartCaptureSession,
  filloutPath,
  installPhaseHook,
  pollTrials,
  reactionMappingStudy,
  waitForStimulus,
} from '../helpers/reaction-api';

/**
 * RT-6 mapping. A single ResponseOption (`left`) is bound to BOTH `f` and `g`.
 * Either physical key must resolve to the same semantic option id — two trials,
 * one pressed with each key, both land on `left`.
 */
test.describe('@reaction mapping — two bindings, one option id', () => {
  test.describe.configure({ timeout: 120000 });

  test('f and g both resolve to option `left`', async ({ page, request, workspace }) => {
    const study = await reactionMappingStudy(request, workspace);

    await installPhaseHook(page);
    await page.goto(filloutPath(study.questionnaireCode));
    await expect(page.getByTestId('fillout-welcome-screen')).toBeVisible();

    const sessionId = await clickStartCaptureSession(page);
    await expect(page.getByTestId('fillout-runtime-canvas')).toBeVisible({ timeout: 30000 });

    const presses = ['f', 'g'];
    for (let index = 0; index < presses.length; index += 1) {
      await waitForStimulus(page, index);
      await page.waitForTimeout(80);
      await page.keyboard.press(presses[index]!);
    }

    await expect(page.getByTestId('fillout-completion-screen')).toBeVisible({ timeout: 30000 });

    const trials = await pollTrials(request, sessionId, study.workspace, 2);
    expect(trials).toHaveLength(2);
    for (const trial of trials) {
      expect(trial.option_id).toBe('left');
      expect(trial.source).toBe('keyboard');
      expect(trial.correct).toBe(true);
    }
  });
});
