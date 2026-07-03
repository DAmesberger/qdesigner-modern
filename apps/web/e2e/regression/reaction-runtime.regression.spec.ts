import { expect, test } from '@playwright/test';
import {
  getSnapshot,
  injectResponse,
  injectStimulusOnset,
  injectTrial,
  loadScenario,
  openRuntimeHarness,
  runControlFlow,
  type TrialView,
} from '../helpers/runtime-harness';

/**
 * Reaction-runtime harness specs.
 *
 * Rebuilds the intent of the removed `runtime-scenarios` specs (control-flow
 * skip, deterministic randomization, computed RT, trial counts, congruency) but
 * drives everything through the build-guarded `/test-runtime` debug global with
 * INJECTED deterministic timing rather than real key events and wall-clock RT.
 *
 * Requires the frontend dev/preview server (playwright.config `webServer`
 * runs `pnpm dev`, which enables the harness via `import.meta.env.DEV`). No
 * backend is needed for the trial/timing/flow assertions; these are pure. The
 * CI e2e job that stands up the frontend server will execute them.
 */
test.describe('@regression reaction runtime harness', () => {
  test.describe.configure({ timeout: 60000 });

  test('exposes the debug global once the harness is ready', async ({ page }) => {
    await openRuntimeHarness(page, { scenario: 'stroop', seed: 'ready-seed' });

    const snapshot = await getSnapshot(page);
    expect(snapshot.ready).toBe(true);
    expect(snapshot.scenario).toBe('stroop');
    expect(snapshot.seed).toBe('ready-seed');
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.trialCount).toBeGreaterThan(0);
  });

  test('computes reaction time as response minus onset, exactly', async ({ page }) => {
    await openRuntimeHarness(page, { scenario: 'stroop', seed: 'rt-seed' });

    // Inject a synthetic onset and response with controlled high-resolution
    // timestamps. RT must equal the difference exactly (same formula the
    // runtime and ReactionEngine use: computeReactionTimeMs).
    const trial = await injectTrial(page, 0, 1000.5, 1450.75, 'r');
    expect(trial.stimulusOnsetTimestamp).toBe(1000.5);
    expect(trial.responseTimestamp).toBe(1450.75);
    expect(trial.reactionTimeMs).toBeCloseTo(450.25, 6);

    // A second trial with a different delta, independently.
    const trial2 = await injectTrial(page, 1, 5000, 5123, 'b');
    expect(trial2.reactionTimeMs).toBe(123);
  });

  test('clamps reaction time at zero when a response precedes onset', async ({ page }) => {
    await openRuntimeHarness(page, { scenario: 'stroop', seed: 'clamp-seed' });

    const trial = await injectTrial(page, 0, 2000, 1900, 'r');
    expect(trial.reactionTimeMs).toBe(0);
  });

  test('requires a stimulus onset before a response can be injected', async ({ page }) => {
    await openRuntimeHarness(page, { scenario: 'stroop', seed: 'guard-seed' });

    await expect(injectResponse(page, 0, 1234, 'r')).rejects.toThrow(/stimulus onset/i);

    // After injecting onset, the response resolves.
    await injectStimulusOnset(page, 0, 1000);
    const trial = await injectResponse(page, 0, 1300, 'r');
    expect(trial.reactionTimeMs).toBe(300);
  });

  test('randomization is deterministic for a fixed seed and varies across seeds', async ({
    page,
  }) => {
    await openRuntimeHarness(page);

    const first = await loadScenario(page, 'stroop', { seed: 'seed-alpha', trialCount: 12 });
    const second = await loadScenario(page, 'stroop', { seed: 'seed-alpha', trialCount: 12 });

    const ids = (snapshotTrials: TrialView[]) => snapshotTrials.map((t) => t.id);
    const congruencies = (snapshotTrials: TrialView[]) =>
      snapshotTrials.map((t) => t.congruency);

    // Same seed => identical trial sequence AND identical congruency ordering.
    expect(ids(second.trials)).toEqual(ids(first.trials));
    expect(congruencies(second.trials)).toEqual(congruencies(first.trials));

    // Different seed => different congruency ordering (12 trials makes an
    // accidental full match astronomically unlikely).
    const other = await loadScenario(page, 'stroop', { seed: 'seed-omega', trialCount: 12 });
    expect(congruencies(other.trials)).not.toEqual(congruencies(first.trials));
  });

  test('generates the requested number of trials', async ({ page }) => {
    await openRuntimeHarness(page);

    const twelve = await loadScenario(page, 'stroop', { seed: 's', trialCount: 12 });
    expect(twelve.trialCount).toBe(12);
    expect(twelve.trials).toHaveLength(12);

    const twenty = await loadScenario(page, 'flanker', { seed: 's', trialCount: 20 });
    expect(twenty.trialCount).toBe(20);

    const nback = await loadScenario(page, 'nback', { seed: 's', trialCount: 15 });
    expect(nback.trialCount).toBe(15);
  });

  test('assigns congruency per the configured ratio (stroop)', async ({ page }) => {
    await openRuntimeHarness(page);
    const snapshot = await loadScenario(page, 'stroop', { seed: 'congruent-seed', trialCount: 12 });

    const congruent = snapshot.trials.filter((t) => t.congruency === 'congruent');
    const incongruent = snapshot.trials.filter((t) => t.congruency === 'incongruent');

    // congruentRatio 0.5 over 12 trials => 6 / 6.
    expect(congruent).toHaveLength(6);
    expect(incongruent).toHaveLength(6);
    // Every trial carries a valid congruency and an expected response key.
    for (const trial of snapshot.trials) {
      expect(['congruent', 'incongruent']).toContain(trial.congruency);
      expect(typeof trial.expectedResponse).toBe('string');
    }
  });

  test('n-back marks the expected number of targets', async ({ page }) => {
    await openRuntimeHarness(page);
    const snapshot = await loadScenario(page, 'nback', { seed: 'nback-seed', trialCount: 12 });

    const targets = snapshot.trials.filter((t) => t.isTarget === true);
    // sequenceLength 12, n=2, targetRate 0.3 => round((12-2)*0.3) = 3 targets.
    expect(targets).toHaveLength(3);
  });

  test('marks correctness by comparing the injected response to the expected key', async ({
    page,
  }) => {
    await openRuntimeHarness(page, { scenario: 'stroop', seed: 'correct-seed' });

    const snapshot = await getSnapshot(page);
    const expectedKey = snapshot.trials[0]!.expectedResponse!;

    const correctTrial = await injectTrial(page, 0, 1000, 1400, expectedKey);
    expect(correctTrial.correct).toBe(true);

    const wrongKey = expectedKey === 'x' ? 'y' : 'x';
    const wrongTrial = await injectTrial(page, 1, 1000, 1400, wrongKey);
    expect(wrongTrial.correct).toBe(false);
  });

  test('control flow skips the gated page when the skip condition matches', async ({ page }) => {
    await openRuntimeHarness(page, { scenario: 'control-flow' });

    // Gate answer = 1 satisfies `(_currentPage == 1) and (q_gate_value == 1)`,
    // so p2 is skipped and p3 is reached.
    const skip = await runControlFlow(page, { q_gate: 1 });
    expect(skip.presentedPageIds).toEqual(['p1', 'p3']);
    expect(skip.skippedPageIds).toContain('p2');
    expect(skip.presentedQuestionIds).toContain('q_target');
    expect(skip.presentedQuestionIds).not.toContain('q_should_skip');
  });

  test('control flow runs sequentially when the skip condition does not match', async ({
    page,
  }) => {
    await openRuntimeHarness(page, { scenario: 'control-flow' });

    // Gate answer = 0 fails the skip condition => all pages presented in order.
    const sequential = await runControlFlow(page, { q_gate: 0 });
    expect(sequential.presentedPageIds).toEqual(['p1', 'p2', 'p3']);
    expect(sequential.skippedPageIds).toEqual([]);
    expect(sequential.presentedQuestionIds).toContain('q_should_skip');
  });
});
