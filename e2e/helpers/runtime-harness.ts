import { expect, type Page } from '@playwright/test';
import {
  serializeRuntimeFixture,
  type RuntimeScenarioFixture,
  type RuntimeScenarioName,
} from './questionnaire-fixtures';
import {
  getRuntimeState,
  pressKeySequence,
  waitForQuestion,
  waitForRuntimeBound,
  waitForRuntimeStart,
} from './runtime-assertions';

export async function openRuntimeFixture(
  page: Page,
  fixture: RuntimeScenarioFixture,
  options?: { autostart?: boolean }
): Promise<void> {
  const fixturePayload = serializeRuntimeFixture(fixture);
  const params = new URLSearchParams({
    scenario: fixture.name,
    fixture: fixturePayload,
  });

  if (options?.autostart) {
    params.set('autostart', '1');
  }

  await page.goto(`/test-runtime?${params.toString()}`);
  await waitForRuntimeBound(page, fixture.name);
}

async function focusRuntimeCanvas(page: Page): Promise<void> {
  const canvas = page.getByTestId('test-runtime-canvas');

  if (await canvas.isVisible().catch(() => false)) {
    await canvas.click({ force: true });
    return;
  }

  await page.mouse.click(10, 10);
}

async function dispatchKeySequenceWithRetry(page: Page, keys?: string[]): Promise<void> {
  if (!keys || keys.length === 0) return;

  const baseline = await getRuntimeState(page);
  const baselineResponses = baseline?.responses.length ?? 0;
  const baselineCompleted = Boolean(baseline?.completed);

  await focusRuntimeCanvas(page);
  await page.waitForTimeout(50);
  await pressKeySequence(page, keys);
  await page.waitForTimeout(120);

  const afterFirstAttempt = await getRuntimeState(page);
  const hasProgress =
    (afterFirstAttempt?.responses.length ?? 0) > baselineResponses ||
    (!baselineCompleted && Boolean(afterFirstAttempt?.completed));

  if (hasProgress) return;

  await focusRuntimeCanvas(page);
  await page.waitForTimeout(50);
  await pressKeySequence(page, keys);
}

export async function startRuntimeFixture(
  page: Page,
  fixture: RuntimeScenarioFixture
): Promise<void> {
  await openRuntimeFixture(page, fixture, { autostart: true });

  try {
    await waitForRuntimeStart(page);
  } catch {
    // Fallback for environments where autostart does not trigger reliably.
    const startButton = page.getByTestId('test-runtime-start-button');
    if (await startButton.isVisible().catch(() => false)) {
      await expect(startButton).toBeVisible();
      await startButton.click({ force: true });
    }
    await waitForRuntimeStart(page);
  }

  if (fixture.waitForQuestionId) {
    await waitForQuestion(page, fixture.waitForQuestionId);
  }

  await dispatchKeySequenceWithRetry(page, fixture.keySequence);
}

export function fixtureName(name: RuntimeScenarioName): string {
  return name;
}
