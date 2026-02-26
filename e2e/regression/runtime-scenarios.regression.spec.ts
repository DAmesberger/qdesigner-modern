import { expect, type Page, test } from '@playwright/test';

type ScenarioName =
  | 'control-flow'
  | 'randomization'
  | 'programmability'
  | 'answer-options'
  | 'chart-feedback';

interface RuntimeDebugState {
  presentedQuestionIds: string[];
  responses: Array<{ questionId: string; value: unknown; valid: boolean }>;
  variables: Record<string, unknown>;
  completed: boolean;
}

async function startScenario(page: Page, scenario: ScenarioName): Promise<void> {
  await page.goto(`/test-runtime?scenario=${scenario}`);

  const startButton = page.getByRole('button', { name: 'Start Test' });
  await expect(startButton).toBeVisible();
  await startButton.click();
  await expect(startButton).toBeHidden({ timeout: 10000 });
}

async function waitForQuestion(page: Page, questionId: string): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (value) =>
            (window as any).__QDESIGNER_RUNTIME_DEBUG__?.presentedQuestionIds.includes(value) ??
            false,
          questionId
        ),
      { timeout: 10000 }
    )
    .toBe(true);
}

async function waitForCompletion(page: Page): Promise<RuntimeDebugState> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as any).__QDESIGNER_RUNTIME_DEBUG__?.completed ?? false),
      { timeout: 15000 }
    )
    .toBe(true);

  const state = await page.evaluate(() => (window as any).__QDESIGNER_RUNTIME_DEBUG__);
  if (!state) {
    throw new Error('Missing runtime debug state');
  }

  return state as RuntimeDebugState;
}

test.describe('@regression focused runtime scenarios', () => {
  test('control flow skips a page when rule condition matches', async ({ page }) => {
    await startScenario(page, 'control-flow');
    await waitForQuestion(page, 'q_gate');

    await page.keyboard.press('y');

    const state = await waitForCompletion(page);
    expect(state.presentedQuestionIds).toContain('q_gate');
    expect(state.presentedQuestionIds).toContain('q_target');
    expect(state.presentedQuestionIds).not.toContain('q_should_skip');
  });

  test('randomization is deterministic with fixed positions', async ({ page }) => {
    await startScenario(page, 'randomization');
    const firstRun = await waitForCompletion(page);

    await startScenario(page, 'randomization');
    const secondRun = await waitForCompletion(page);

    expect(firstRun.presentedQuestionIds).toEqual(secondRun.presentedQuestionIds);
    expect(firstRun.presentedQuestionIds[0]).toBe('q_fixed_start');
    expect(firstRun.presentedQuestionIds[firstRun.presentedQuestionIds.length - 1]).toBe(
      'q_fixed_end'
    );
  });

  test('programmability formulas drive flow and computed variables', async ({ page }) => {
    await startScenario(page, 'programmability');
    const state = await waitForCompletion(page);

    expect(state.presentedQuestionIds).toContain('q_prog_seed');
    expect(state.presentedQuestionIds).toContain('q_prog_target');
    expect(state.presentedQuestionIds).not.toContain('q_prog_skip');
    expect(state.variables.threshold).toBe(450);
    expect(state.variables.should_skip).toBe(true);
  });

  test('answer options are captured from keyboard selection', async ({ page }) => {
    await startScenario(page, 'answer-options');
    await waitForQuestion(page, 'q_choice');

    await page.keyboard.press('l');

    const state = await waitForCompletion(page);
    const choiceResponse = state.responses.find((response) => response.questionId === 'q_choice');

    expect(choiceResponse).toBeTruthy();
    expect(choiceResponse?.value).toBe('left');
    expect(choiceResponse?.valid).toBe(true);
  });

  test('chart feedback question appears immediately after the input response', async ({ page }) => {
    await startScenario(page, 'chart-feedback');
    await waitForQuestion(page, 'q_chart_input');

    await page.keyboard.press('a');

    const state = await waitForCompletion(page);
    const inputIndex = state.presentedQuestionIds.indexOf('q_chart_input');
    const feedbackIndex = state.presentedQuestionIds.indexOf('q_chart_feedback');
    const inputResponse = state.responses.find(
      (response) => response.questionId === 'q_chart_input'
    );

    expect(feedbackIndex).toBeGreaterThan(inputIndex);
    expect(inputResponse?.value).toBe('alpha');
  });
});
