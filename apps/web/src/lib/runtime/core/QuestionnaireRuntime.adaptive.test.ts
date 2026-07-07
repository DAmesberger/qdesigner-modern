import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { CATItem, Questionnaire, QuestionnaireSession } from '$lib/shared';

/**
 * End-to-end proof that an `adaptive` block wires the CAT/IRT engine into the fillout
 * runtime (E-FLOW-1): the block administers items dynamically (fewer than maxItems),
 * adapts difficulty to the running ability estimate (harder items after correct answers),
 * writes `_theta` / `_thetaSE`, and snapshots the trajectory into
 * `session.metadata.custom.adaptive`.
 *
 * A controllable FormQuestionHost captures each presented item and lets the test submit
 * a simulated response, driving the adaptive presentation loop turn by turn.
 */

// -- Deterministic PRNG for the simulated respondent --------------------------------
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function irt3pl(theta: number, a: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

const BANK_SIZE = 40;

function calibratedBank(): CATItem[] {
  const items: CATItem[] = [];
  for (let i = 0; i < BANK_SIZE; i++) {
    items.push({ id: `item-${i + 1}`, a: 1.8, b: -3 + (6 * i) / (BANK_SIZE - 1), c: 0 });
  }
  return items;
}

function adaptiveQuestionnaire(): Questionnaire {
  const bank = calibratedBank();
  const questions = bank.map((item, index) => ({
    id: item.id,
    type: 'single-choice',
    order: index + 1,
    required: false,
    display: {
      prompt: `Item ${item.id}`,
      options: [
        { id: 'y', label: 'Yes', value: 'yes' },
        { id: 'n', label: 'No', value: 'no' },
      ],
    },
    response: { saveAs: item.id, valueType: 'value' },
    responseType: { type: 'single' },
  }));

  return {
    id: 'qn-adaptive',
    name: 'Adaptive block fixture',
    version: '1.0.0',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    created: new Date(),
    modified: new Date(),
    variables: [],
    questions,
    pages: [
      {
        id: 'p1',
        name: 'Adaptive page',
        blocks: [
          {
            id: 'b-adaptive',
            pageId: 'p1',
            name: 'Ability bank',
            type: 'adaptive',
            questions: bank.map((i) => i.id),
            adaptive: {
              itemBankId: 'ability-v1',
              items: bank,
              maxItems: 30,
              seThreshold: 0.3,
              thetaReportVariable: 'ability',
              scoring: bank.map((i) => ({ questionId: i.id, correctValue: 'yes' })),
            },
          },
        ],
      },
    ],
    flow: [],
    settings: {},
  } as unknown as Questionnaire;
}

/** A FormQuestionHost that records the latest presentation so the test can answer it. */
function controllableHost(): FormQuestionHost & { current: FormHostPresentation | null } {
  const host = {
    current: null as FormHostPresentation | null,
    present(presentation: FormHostPresentation) {
      this.current = presentation;
    },
    clear() {
      this.current = null;
    },
  };
  return host;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('QuestionnaireRuntime adaptive item-bank block (E-FLOW-1)', () => {
  beforeAll(async () => {
    if (typeof (globalThis as { AudioContext?: unknown }).AudioContext === 'undefined') {
      (globalThis as { AudioContext?: unknown }).AudioContext = class {
        decodeAudioData() {
          return Promise.resolve({});
        }
        close() {
          return Promise.resolve();
        }
      };
    }
    await ensureModulesRegistered();
  });

  it('administers items adaptively, adapts difficulty, and snapshots the trajectory', async () => {
    const bank = calibratedBank();
    const bankById = new Map(bank.map((i) => [i.id, i]));
    const trueTheta = 1.0;
    const rng = mulberry32(12345);

    let completed: QuestionnaireSession | null = null;
    const host = controllableHost();

    const runtime = new QuestionnaireRuntime({
      canvas: document.createElement('canvas'),
      questionnaire: adaptiveQuestionnaire(),
      formHost: host,
      onComplete: (session) => {
        completed = session;
      },
    });

    await runtime.start();
    await flush();

    const presentedOrder: string[] = [];
    let guard = 0;

    // Drive the adaptive loop: answer each presented item as a simulated respondent until
    // the block finalizes and the session completes.
    while (host.current && host.current.interactive && !completed && guard < BANK_SIZE + 5) {
      guard += 1;
      const presented = host.current.item as { id: string };
      presentedOrder.push(presented.id);

      const item = bankById.get(presented.id)!;
      const p = irt3pl(trueTheta, item.a, item.b, item.c ?? 0);
      const correct = rng() < p;
      host.current.onSubmit(correct ? 'yes' : 'no');
      await flush();
    }

    // 1. Adaptive stopping: fewer items than the bank / maxItems (SE rule fired early).
    expect(presentedOrder.length).toBeGreaterThan(0);
    expect(presentedOrder.length).toBeLessThan(30);
    // No item administered twice.
    expect(new Set(presentedOrder).size).toBe(presentedOrder.length);

    // 2. Difficulty adapts to ability: the mean difficulty of the SECOND half of the
    // administered items is higher than the first (a high-ability respondent is pushed
    // toward harder items as the estimate climbs).
    const half = Math.floor(presentedOrder.length / 2);
    const meanB = (ids: string[]) =>
      ids.reduce((sum, id) => sum + bankById.get(id)!.b, 0) / Math.max(1, ids.length);
    expect(meanB(presentedOrder.slice(half))).toBeGreaterThan(meanB(presentedOrder.slice(0, half)));

    // 3. Session completed and the ability estimate landed near the truth.
    expect(completed).not.toBeNull();
    const session = completed! as QuestionnaireSession;
    const thetaVar = runtime.getVariableEngine().getAllVariables().theta as number;
    // A single CAT run terminates at SE ≈ 0.3, so the point estimate for one respondent
    // can land up to ~2 SE from truth; assert a generous "near truth" bound here (the
    // AdaptiveController suite proves tight convergence in the mean over many respondents).
    expect(Math.abs(thetaVar - trueTheta)).toBeLessThan(1.0);

    // 4. Trajectory snapshot persisted for the offline-first write path (step 7).
    const custom = session.metadata?.custom as Record<string, unknown> | undefined;
    const adaptive = custom?.adaptive as Array<Record<string, unknown>> | undefined;
    expect(adaptive).toBeTruthy();
    expect(adaptive!.length).toBe(1);
    const record = adaptive![0]!;
    expect(record.blockId).toBe('b-adaptive');
    expect(record.itemBankId).toBe('ability-v1');
    expect(record.complete).toBe(true);
    expect((record.administeredItemIds as string[]).length).toBe(presentedOrder.length);
    expect(record.itemsAdministered).toBe(presentedOrder.length);
    expect(Number.isFinite(record.theta as number)).toBe(true);
    // The researcher-named report variable also received the estimate.
    expect(runtime.getVariableEngine().getAllVariables().ability as number).toBeCloseTo(
      thetaVar,
      5
    );

    runtime.dispose();
  });

  it('exposes _theta / _thetaSE as flow-condition variables (defaults before any CAT)', async () => {
    const runtime = new QuestionnaireRuntime({
      canvas: document.createElement('canvas'),
      questionnaire: adaptiveQuestionnaire(),
      formHost: controllableHost(),
    });
    await runtime.start();
    await flush();

    const vars = runtime.getVariableEngine().getAllVariables();
    // Registered up front (step 6) so branching on measurement precision is valid even
    // before any adaptive item is administered.
    expect(vars.theta).toBe(0);
    expect(vars.thetaSE).toBe(999);
    expect(vars.adaptiveItemsAdministered).toBe(0);

    runtime.dispose();
  });
});
