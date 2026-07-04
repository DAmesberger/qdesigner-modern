import { expect, type Page } from '@playwright/test';

/**
 * Playwright-side driver for the deterministic reaction harness exposed at the
 * build-guarded `/test-runtime` route (see
 * `apps/web/src/routes/test-runtime/harness.ts`). All timing is injected, never
 * measured, so these helpers never wait on real reaction latency.
 */

export interface TrialView {
  index: number;
  id: string;
  congruency?: string;
  expectedResponse?: string;
  isTarget?: boolean;
  word?: string;
  inkColor?: string;
  displayString?: string;
  stimulusOnsetTimestamp: number | null;
  responseTimestamp: number | null;
  reactionTimeMs: number | null;
  responseValue: string | null;
  correct: boolean | null;
}

export interface ControlFlowResult {
  presentedPageIds: string[];
  presentedQuestionIds: string[];
  skippedPageIds: string[];
}

export interface RuntimeDebugSnapshot {
  ready: boolean;
  scenario: string;
  seed: string;
  trials: TrialView[];
  trialCount: number;
  currentTrialIndex: number;
  currentTrial: TrialView | null;
  stimulusOnsetTimestamp: number | null;
  responseTimestamp: number | null;
  reactionTimeMs: number | null;
  controlFlow: ControlFlowResult | null;
  completed: boolean;
  errors: string[];
}

export type ScenarioName = 'stroop' | 'flanker' | 'nback' | 'control-flow';

export interface ScenarioOptions {
  seed?: string;
  trialCount?: number;
  answers?: Record<string, unknown>;
}

const HARNESS_PATH = '/test-runtime';

/** Navigate to the harness and wait until the debug global is installed. */
export async function openRuntimeHarness(
  page: Page,
  options?: { scenario?: ScenarioName; seed?: string }
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.scenario) params.set('scenario', options.scenario);
  if (options?.seed) params.set('seed', options.seed);

  const query = params.toString();
  await page.goto(query ? `${HARNESS_PATH}?${query}` : HARNESS_PATH);

  await expect(page.getByTestId('test-runtime-ready')).toHaveText('ready', { timeout: 15000 });
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__QDESIGNER_RUNTIME_DEBUG__)), {
      timeout: 15000,
    })
    .toBe(true);
}

export async function getSnapshot(page: Page): Promise<RuntimeDebugSnapshot> {
  return page.evaluate(() => window.__QDESIGNER_RUNTIME_DEBUG__!.snapshot());
}

export async function loadScenario(
  page: Page,
  scenario: ScenarioName,
  options?: ScenarioOptions
): Promise<RuntimeDebugSnapshot> {
  return page.evaluate(
    ([name, opts]) => window.__QDESIGNER_RUNTIME_DEBUG__!.loadScenario(name, opts),
    [scenario, options ?? {}] as const
  );
}

export async function injectStimulusOnset(
  page: Page,
  index: number,
  onsetTimestamp: number
): Promise<void> {
  await page.evaluate(
    ([i, onset]) => window.__QDESIGNER_RUNTIME_DEBUG__!.injectStimulusOnset(i, onset),
    [index, onsetTimestamp] as const
  );
}

export async function injectResponse(
  page: Page,
  index: number,
  responseTimestamp: number,
  value?: string
): Promise<TrialView> {
  return page.evaluate(
    ([i, response, val]) => window.__QDESIGNER_RUNTIME_DEBUG__!.injectResponse(i, response, val),
    [index, responseTimestamp, value] as const
  );
}

/** Inject a full trial (onset + response) and return the computed trial. */
export async function injectTrial(
  page: Page,
  index: number,
  onsetTimestamp: number,
  responseTimestamp: number,
  value?: string
): Promise<TrialView> {
  return page.evaluate(
    ([i, onset, response, val]) =>
      window.__QDESIGNER_RUNTIME_DEBUG__!.injectTrial(i, onset, response, val),
    [index, onsetTimestamp, responseTimestamp, value] as const
  );
}

export async function runControlFlow(
  page: Page,
  answers?: Record<string, unknown>
): Promise<ControlFlowResult> {
  return page.evaluate(
    (a) => window.__QDESIGNER_RUNTIME_DEBUG__!.runControlFlow(a),
    answers ?? { q_gate: 1 }
  );
}

declare global {
  interface Window {
    __QDESIGNER_RUNTIME_DEBUG__?: {
      snapshot(): RuntimeDebugSnapshot;
      loadScenario(name: ScenarioName, options?: ScenarioOptions): RuntimeDebugSnapshot;
      injectStimulusOnset(index: number, onsetTimestamp: number): void;
      injectResponse(index: number, responseTimestamp: number, value?: string): TrialView;
      injectTrial(
        index: number,
        onsetTimestamp: number,
        responseTimestamp: number,
        value?: string
      ): TrialView;
      advance(): number;
      runControlFlow(answers?: Record<string, unknown>): ControlFlowResult;
    };
  }
}
