import { expect, test } from '@playwright/test';
import { getRuntimeScenarioFixture } from '../helpers/questionnaire-fixtures';
import { startRuntimeFixture } from '../helpers/runtime-harness';
import { assertNoRuntimeErrors, waitForCompletion } from '../helpers/runtime-assertions';

test.describe('@regression focused runtime scenarios', () => {
  test.describe.configure({ timeout: 60000 });

  test('control flow skips a page when rule condition matches', async ({ page }) => {
    const fixture = getRuntimeScenarioFixture('control-flow');

    await startRuntimeFixture(page, fixture);
    const state = await waitForCompletion(page);

    for (const requiredId of fixture.expectedPresented?.include || []) {
      expect(state.presentedQuestionIds).toContain(requiredId);
    }

    for (const skippedId of fixture.expectedPresented?.exclude || []) {
      expect(state.presentedQuestionIds).not.toContain(skippedId);
    }

    await assertNoRuntimeErrors(page);
  });

  test('randomization is deterministic with fixed positions', async ({ page }) => {
    const fixture = getRuntimeScenarioFixture('randomization');

    await startRuntimeFixture(page, fixture);
    const firstRun = await waitForCompletion(page);

    await startRuntimeFixture(page, fixture);
    const secondRun = await waitForCompletion(page);

    expect(firstRun.presentedQuestionIds).toEqual(secondRun.presentedQuestionIds);

    if (!fixture.expectedFixedPositions) {
      throw new Error('Missing expected fixed-position configuration');
    }

    expect(firstRun.presentedQuestionIds[0]).toBe(fixture.expectedFixedPositions.firstQuestionId);
    expect(firstRun.presentedQuestionIds[firstRun.presentedQuestionIds.length - 1]).toBe(
      fixture.expectedFixedPositions.lastQuestionId
    );

    await assertNoRuntimeErrors(page);
  });

  test('programmability formulas drive flow and computed variables', async ({ page }) => {
    const fixture = getRuntimeScenarioFixture('programmability');

    await startRuntimeFixture(page, fixture);
    const state = await waitForCompletion(page);

    for (const requiredId of fixture.expectedPresented?.include || []) {
      expect(state.presentedQuestionIds).toContain(requiredId);
    }

    for (const skippedId of fixture.expectedPresented?.exclude || []) {
      expect(state.presentedQuestionIds).not.toContain(skippedId);
    }

    for (const [name, expectedValue] of Object.entries(fixture.expectedVariables || {})) {
      expect(state.variables[name]).toBe(expectedValue);
    }

    await assertNoRuntimeErrors(page);
  });

  test('answer options are captured from keyboard selection', async ({ page }) => {
    const fixture = getRuntimeScenarioFixture('answer-options');

    await startRuntimeFixture(page, fixture);
    const state = await waitForCompletion(page);

    if (!fixture.expectedResponse) {
      throw new Error('Missing expected response configuration');
    }

    const response = state.responses.find(
      (entry) => entry.questionId === fixture.expectedResponse?.questionId
    );

    expect(response).toBeTruthy();
    expect(response?.value).toBe(fixture.expectedResponse.value);

    if (fixture.expectedResponse.valid !== undefined) {
      expect(response?.valid).toBe(fixture.expectedResponse.valid);
    }

    await assertNoRuntimeErrors(page);
  });

  test('chart feedback question appears immediately after the input response', async ({ page }) => {
    const fixture = getRuntimeScenarioFixture('chart-feedback');

    await startRuntimeFixture(page, fixture);
    const state = await waitForCompletion(page);

    if (!fixture.expectedResponse || !fixture.expectedImmediateFollowUp) {
      throw new Error('Missing chart feedback expectation configuration');
    }

    const response = state.responses.find(
      (entry) => entry.questionId === fixture.expectedResponse?.questionId
    );

    const inputIndex = state.presentedQuestionIds.indexOf(
      fixture.expectedImmediateFollowUp.firstQuestionId
    );
    const feedbackIndex = state.presentedQuestionIds.indexOf(
      fixture.expectedImmediateFollowUp.secondQuestionId
    );

    expect(feedbackIndex).toBeGreaterThan(inputIndex);
    expect(response?.value).toBe(fixture.expectedResponse.value);

    await assertNoRuntimeErrors(page);
  });

  test('n-back task runs with task metadata and expected trial count', async ({ page }) => {
    const fixture = getRuntimeScenarioFixture('n-back');

    await startRuntimeFixture(page, fixture);
    const state = await waitForCompletion(page);

    if (!fixture.expectedReaction) {
      throw new Error('Missing n-back expectation configuration');
    }

    const response = state.responses.find(
      (entry) => entry.questionId === fixture.expectedReaction?.questionId
    );

    expect(response).toBeTruthy();
    const payload = response?.value as {
      responses?: Array<{ taskType?: string }>;
    };
    expect(payload?.responses?.length).toBeGreaterThanOrEqual(fixture.expectedReaction.minTrials);

    const taskTypes = (payload?.responses || []).map((trial) => trial.taskType);
    expect(taskTypes.every((taskType) => taskType === fixture.expectedReaction?.taskType)).toBe(true);

    await assertNoRuntimeErrors(page);
  });

  test('mixed questionnaire flow runs visual reaction blocks with block/condition metadata', async ({ page }) => {
    const fixture = getRuntimeScenarioFixture('mixed-reaction');

    await startRuntimeFixture(page, fixture);
    const state = await waitForCompletion(page);

    for (const requiredId of fixture.expectedPresented?.include || []) {
      expect(state.presentedQuestionIds).toContain(requiredId);
    }

    if (!fixture.expectedResponse || !fixture.expectedReaction) {
      throw new Error('Missing mixed-reaction expectation configuration');
    }

    const introResponse = state.responses.find(
      (entry) => entry.questionId === fixture.expectedResponse?.questionId
    );
    expect(introResponse?.value).toBe(fixture.expectedResponse.value);

    const reactionResponse = state.responses.find(
      (entry) => entry.questionId === fixture.expectedReaction?.questionId
    );
    expect(reactionResponse).toBeTruthy();

    const payload = reactionResponse?.value as {
      responses?: Array<{ taskType?: string; blockId?: string; condition?: string | null }>;
    };
    expect(payload?.responses?.length).toBeGreaterThanOrEqual(fixture.expectedReaction.minTrials);
    expect(
      (payload?.responses || []).every((trial) => trial.taskType === fixture.expectedReaction?.taskType)
    ).toBe(true);
    expect((payload?.responses || []).every((trial) => Boolean(trial.blockId))).toBe(true);
    expect((payload?.responses || []).some((trial) => trial.condition === 'congruent')).toBe(true);
    expect((payload?.responses || []).some((trial) => trial.condition === 'incongruent')).toBe(true);

    await assertNoRuntimeErrors(page);
  });
});
