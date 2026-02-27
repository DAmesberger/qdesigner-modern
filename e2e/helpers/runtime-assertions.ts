import { expect, type Page } from '@playwright/test';

export interface RuntimeDebugState {
  scenario: string;
  modulesReady?: boolean;
  progressEvents: Array<{ current: number; total: number }>;
  presentedQuestionIds: string[];
  presentedEvents: Array<{ questionId: string; timestamp: number }>;
  responses: Array<{ questionId: string; value: unknown; valid: boolean }>;
  variables: Record<string, unknown>;
  completed: boolean;
  startedAt?: number;
  completedAt?: number;
  sessionStatus?: string;
  errors?: string[];
}

export async function getRuntimeState(page: Page): Promise<RuntimeDebugState | null> {
  try {
    return await page.evaluate(
      () => ((window as any).__QDESIGNER_RUNTIME_DEBUG__ ?? null) as RuntimeDebugState | null
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Execution context was destroyed')) {
      return null;
    }

    throw error;
  }
}

export async function waitForRuntimeBound(page: Page, expectedScenario: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await getRuntimeState(page);
        if (!state) return null;

        if (state.scenario !== expectedScenario) {
          return null;
        }

        if (state.modulesReady === false) {
          return null;
        }

        return state.scenario;
      },
      { timeout: 10000 }
    )
    .toBe(expectedScenario);
}

export async function waitForRuntimeStart(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await getRuntimeState(page);
        if (!state) return null;
        if (state.errors?.length) {
          throw new Error(`Runtime failed to start: ${state.errors.join(' | ')}`);
        }

        if (state.completed || state.presentedQuestionIds.length > 0) {
          return 'started';
        }

        return null;
      },
      { timeout: 30000 }
    )
    .toBe('started');
}

export async function waitForQuestion(page: Page, questionId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await getRuntimeState(page);
        if (!state) return false;

        if (state.errors?.length) {
          throw new Error(`Runtime error: ${state.errors.join(' | ')}`);
        }

        return state.presentedQuestionIds.includes(questionId);
      },
      { timeout: 15000 }
    )
    .toBe(true);
}

export async function waitForCompletion(page: Page): Promise<RuntimeDebugState> {
  await expect
    .poll(
      async () => {
        const state = await getRuntimeState(page);
        if (!state) return false;

        if (state.errors?.length) {
          throw new Error(`Runtime error: ${state.errors.join(' | ')}`);
        }

        return state.completed;
      },
      { timeout: 20000 }
    )
    .toBe(true);

  const completedState = await getRuntimeState(page);
  if (!completedState) {
    throw new Error('Missing runtime debug state after completion');
  }

  return completedState;
}

export async function assertNoRuntimeErrors(page: Page): Promise<void> {
  const state = await getRuntimeState(page);
  expect(state?.errors || []).toEqual([]);
}

export async function pressKeySequence(page: Page, keys?: string[]): Promise<void> {
  if (!keys || keys.length === 0) return;

  for (const key of keys) {
    await page.keyboard.press(key);
  }
}
