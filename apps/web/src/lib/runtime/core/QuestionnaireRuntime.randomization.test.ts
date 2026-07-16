import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import { BlockRandomizer } from './BlockRandomizer';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { Block, Questionnaire } from '$lib/shared';

/**
 * Block randomization (BlockManager "Randomized Block" — "Questions appear in random
 * order"). Regression guard: a randomized block must genuinely present its questions in
 * a SEEDED shuffle at fillout. The bug was that getPageItems() shuffled the block and
 * then immediately re-sorted the whole page run by `question.order` — undoing the
 * shuffle, so a randomized block always presented in authored order (randomization did
 * nothing). These tests drive the real runtime and assert the presented order is the
 * seeded shuffle (not authored order), is reproducible per session, and that a STANDARD
 * block still presents in authored order.
 */

const AUTHORED_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

function mkQuestion(id: string, order: number) {
  return {
    id,
    type: 'single-choice',
    order,
    required: false,
    display: {
      prompt: `Question ${id}`,
      options: [
        { id: 'a', label: 'A', value: 'a' },
        { id: 'b', label: 'B', value: 'b' },
      ],
    },
    responseType: { type: 'single' },
  };
}

/** A single page carrying one block of type `blockType` with q1..q6 (authored order). */
function buildQuestionnaire(blockType: Block['type']): { questionnaire: Questionnaire; block: Block } {
  const block = {
    id: 'blk-1',
    pageId: 'p1',
    type: blockType,
    questions: [...AUTHORED_IDS],
  } as unknown as Block;

  const questionnaire = {
    id: 'qn-rand',
    name: 'Randomized block fixture',
    version: '1.0.0',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    created: new Date(),
    modified: new Date(),
    variables: [],
    questions: AUTHORED_IDS.map((id, i) => mkQuestion(id, i + 1)),
    pages: [{ id: 'p1', name: 'Page 1', questions: [], blocks: [block] }],
    flow: [],
    settings: {},
  } as unknown as Questionnaire;

  return { questionnaire, block };
}

/** A form host that records each presented item id and answers on demand to advance. */
function drivingHost(): {
  host: FormQuestionHost;
  presented: string[];
  answer: (value: unknown) => Promise<void>;
} {
  const presented: string[] = [];
  let pending: ((value: unknown, meta?: never) => void) | null = null;

  const host: FormQuestionHost = {
    present(presentation: FormHostPresentation) {
      presented.push(presentation.item.id);
      pending = presentation.interactive ? (presentation.onSubmit as typeof pending) : null;
    },
    clear() {
      /* no-op */
    },
  };

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function answer(value: unknown): Promise<void> {
    const cb = pending;
    pending = null;
    cb?.(value);
    await flush();
  }

  return { host, presented, answer };
}

/** Drive a whole single-page run to the end, returning the order items were presented in. */
async function collectPresentedOrder(
  questionnaire: Questionnaire,
  sessionId?: string
): Promise<string[]> {
  const driver = drivingHost();
  const runtime = new QuestionnaireRuntime({
    canvas: document.createElement('canvas'),
    questionnaire,
    sessionId,
    formHost: driver.host,
  });
  await runtime.start();
  // Answer every item on the page; each answer advances to the next until the run ends.
  for (let i = 0; i < AUTHORED_IDS.length; i++) {
    await driver.answer('a');
  }
  runtime.dispose();
  return driver.presented;
}

describe('QuestionnaireRuntime — block randomization', () => {
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

  it('presents a randomized block in seeded-shuffled order — NOT authored order', async () => {
    const sessionId = 'sess-participant-1';
    const { questionnaire, block } = buildQuestionnaire('randomized');

    // The order the runtime SHOULD present: the seeded per-session shuffle. Seed formula
    // mirrors QuestionnaireRuntime's constructor: `${studySeed}::${sessionId}` with
    // studySeed = questionnaire.id (no explicit randomizationSeed set).
    const expected = new BlockRandomizer(`${questionnaire.id}::${sessionId}`).randomizeBlock(block);

    // Guard: this seed actually shuffles (so "presents shuffled" isn't vacuously the
    // same as authored order). If this ever fails, choose a different sessionId.
    expect(expected).not.toEqual(AUTHORED_IDS);
    expect([...expected].sort()).toEqual([...AUTHORED_IDS].sort());

    const presented = await collectPresentedOrder(questionnaire, sessionId);

    // Every question is presented exactly once (nothing dropped/duplicated) ...
    expect([...presented].sort()).toEqual([...AUTHORED_IDS].sort());
    // ... in the seeded shuffle order, not the authored order. Pre-fix, the order-sort
    // undid the shuffle and this equalled AUTHORED_IDS instead.
    expect(presented).toEqual(expected);
    expect(presented).not.toEqual(AUTHORED_IDS);
  });

  it('reproduces the same randomized order for the same session id (resume-stable)', async () => {
    const { questionnaire } = buildQuestionnaire('randomized');
    const first = await collectPresentedOrder(questionnaire, 'sess-participant-1');
    const second = await collectPresentedOrder(questionnaire, 'sess-participant-1');
    expect(second).toEqual(first);
  });

  it('gives different participants independent orders (per-session, not global)', async () => {
    const { questionnaire } = buildQuestionnaire('randomized');
    const a = await collectPresentedOrder(questionnaire, 'sess-participant-1');
    const b = await collectPresentedOrder(questionnaire, 'sess-participant-2');
    // Same set, but the two participants do not share one fixed order.
    expect([...a].sort()).toEqual([...b].sort());
    expect(a).not.toEqual(b);
  });

  it('leaves a STANDARD (non-randomized) block in authored order', async () => {
    const { questionnaire } = buildQuestionnaire('standard');
    const presented = await collectPresentedOrder(questionnaire, 'sess-participant-1');
    expect(presented).toEqual(AUTHORED_IDS);
  });
});
