import { expect, type Page } from '@playwright/test';
import {
  serializeRuntimeFixture,
  type RuntimeScenarioFixture,
  type RuntimeScenarioName,
} from './questionnaire-fixtures';
import {
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

export async function startRuntimeFixture(
  page: Page,
  fixture: RuntimeScenarioFixture
): Promise<void> {
  await openRuntimeFixture(page, fixture);

  const startButton = page.getByTestId('test-runtime-start-button');
  await expect(startButton).toBeVisible();
  await startButton.click();

  await waitForRuntimeStart(page);

  if (fixture.waitForQuestionId) {
    await waitForQuestion(page, fixture.waitForQuestionId);
  }

  await pressKeySequence(page, fixture.keySequence);
}

export function fixtureName(name: RuntimeScenarioName): string {
  return name;
}
