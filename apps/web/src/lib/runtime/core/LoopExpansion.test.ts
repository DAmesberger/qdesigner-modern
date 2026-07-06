import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildIterationTuples,
  resolveLoopValues,
  iterationVarPrefix,
  MAX_LOOP_ITERATIONS,
  DEFAULT_LOOP_VARIABLE_NAME,
} from './LoopExpansion';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import { interpolateVariables } from '$lib/services/variableInterpolation';
import type { Questionnaire } from '$lib/shared';

// ============================================================================
// Pure expansion (E-FLOW-4 steps 1, 9)
// ============================================================================

describe('LoopExpansion — value resolution', () => {
  it('uses the static values list by default', () => {
    expect(resolveLoopValues({ variable: 'rel', values: ['Mother', 'Father', 'Sibling'] })).toEqual([
      'Mother',
      'Father',
      'Sibling',
    ]);
  });

  it('resolves an `answer` source from a prior multi-select response (roster looping)', () => {
    const values = resolveLoopValues(
      { variable: 'people', values: [], source: { type: 'answer', questionId: 'q_people' } },
      { responses: { q_people: ['Alice', 'Bob'] } }
    );
    expect(values).toEqual(['Alice', 'Bob']);
  });

  it('resolves a `variable` source array', () => {
    const values = resolveLoopValues(
      { variable: 'trials', values: [], source: { type: 'variable', variableId: 'stimuli' } },
      { variables: { stimuli: [1, 2, 3] } }
    );
    expect(values).toEqual([1, 2, 3]);
  });

  it('coerces a scalar source value into a single-element list', () => {
    expect(
      resolveLoopValues(
        { variable: 'x', values: [], source: { type: 'answer', questionId: 'q' } },
        { responses: { q: 'solo' } }
      )
    ).toEqual(['solo']);
  });

  it('caps at maxIterations and at the absolute ceiling (runaway guard, step 9)', () => {
    expect(
      resolveLoopValues({ variable: 'x', values: [1, 2, 3, 4, 5], maxIterations: 3 })
    ).toEqual([1, 2, 3]);

    const huge = Array.from({ length: MAX_LOOP_ITERATIONS + 50 }, (_, i) => i);
    expect(resolveLoopValues({ variable: 'x', values: huge }).length).toBe(MAX_LOOP_ITERATIONS);
  });
});

describe('LoopExpansion — tuple assembly', () => {
  it('a 3-value loop produces 3 DISTINCT presentations (not 1)', () => {
    const values = resolveLoopValues({
      variable: 'rel',
      values: ['Mother', 'Father', 'Sibling'],
    });
    const refs = buildIterationTuples({ values, orderForIteration: () => ['q1'] });

    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.iterationIndex)).toEqual([0, 1, 2]);
    expect(refs.map((r) => r.loopValue)).toEqual(['Mother', 'Father', 'Sibling']);
    // Each iteration namespaces its answer variables distinctly.
    expect(refs.map((r) => iterationVarPrefix('q1', r.iterationIndex))).toEqual([
      'q1__0',
      'q1__1',
      'q1__2',
    ]);
    refs.forEach((r) => {
      expect(r.iterationCount).toBe(3);
      expect(r.loopVariableName).toBe(DEFAULT_LOOP_VARIABLE_NAME);
    });
  });

  it('expands a multi-question battery once per iteration in order', () => {
    const refs = buildIterationTuples({
      values: ['A', 'B'],
      orderForIteration: () => ['q1', 'q2', 'q3'],
    });
    expect(refs.map((r) => `${r.questionId}@${r.iterationIndex}`)).toEqual([
      'q1@0',
      'q2@0',
      'q3@0',
      'q1@1',
      'q2@1',
      'q3@1',
    ]);
  });

  it('an empty value list yields a single UNLOOPED pass', () => {
    const refs = buildIterationTuples({ values: [], orderForIteration: () => ['q1', 'q2'] });
    expect(refs).toEqual([
      { questionId: 'q1', iterationIndex: null },
      { questionId: 'q2', iterationIndex: null },
    ]);
  });

  it('honours a custom loopVariableName', () => {
    const refs = buildIterationTuples({
      values: ['x'],
      orderForIteration: () => ['q1'],
      loopVariableName: 'person',
    });
    expect(refs[0]!.loopVariableName).toBe('person');
  });
});

// ============================================================================
// Runtime integration (E-FLOW-4 steps 2-5, 10)
// ============================================================================

function buildLoopedQuestionnaire(): Questionnaire {
  return {
    id: 'qn-loop',
    name: 'Roster loop fixture',
    version: '1.0.0',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    created: new Date(),
    modified: new Date(),
    variables: [],
    questions: [
      {
        id: 'q1',
        type: 'text-input',
        order: 1,
        display: { prompt: 'How close are you to {{loopValue}}?', placeholder: '...' },
        response: { saveAs: 'q1', transform: 'none' },
      },
    ],
    pages: [
      {
        id: 'p1',
        name: 'Battery',
        questions: [],
        blocks: [
          {
            id: 'blk',
            pageId: 'p1',
            type: 'loop',
            questions: ['q1'],
            loop: { variable: 'rel', values: ['Mother', 'Father', 'Sibling'] },
          },
        ],
      },
    ],
    flow: [],
    settings: {},
  } as unknown as Questionnaire;
}

/** Form host that records each presentation's item id + variables snapshot. */
function drivingHost(): {
  host: FormQuestionHost;
  presented: string[];
  variablesAt: Array<Record<string, unknown>>;
  answer: (value: unknown) => Promise<void>;
} {
  const presented: string[] = [];
  const variablesAt: Array<Record<string, unknown>> = [];
  let pending: ((value: unknown, meta?: never) => void) | null = null;

  const host: FormQuestionHost = {
    present(presentation: FormHostPresentation) {
      presented.push(presentation.item.id);
      variablesAt.push({ ...presentation.variables });
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

  return { host, presented, variablesAt, answer };
}

describe('QuestionnaireRuntime — real loop blocks (E-FLOW-4)', () => {
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

  it('presents a 3-value loop three times, pipes {{loopValue}}, and stores 3 distinct responses', async () => {
    const driver = drivingHost();
    let completed: import('$lib/shared').QuestionnaireSession | null = null;

    const runtime = new QuestionnaireRuntime({
      canvas: document.createElement('canvas'),
      questionnaire: buildLoopedQuestionnaire(),
      formHost: driver.host,
      onComplete: (session) => {
        completed = session;
      },
    });

    await runtime.start();

    // Iteration 0 presented with loopValue = 'Mother'.
    expect(driver.presented).toEqual(['q1']);
    expect(driver.variablesAt[0]!.loopValue).toBe('Mother');
    expect(driver.variablesAt[0]!._iterationIndex).toBe(0);
    expect(driver.variablesAt[0]!._iterationCount).toBe(3);
    // The published loop variable interpolates the prompt to this iteration's value.
    expect(interpolateVariables('How close are you to {{loopValue}}?', driver.variablesAt[0]!)).toBe(
      'How close are you to Mother?'
    );

    await driver.answer('very close');

    // Iteration 1 = 'Father'.
    expect(driver.presented).toEqual(['q1', 'q1']);
    expect(driver.variablesAt[1]!.loopValue).toBe('Father');
    await driver.answer('somewhat');

    // Iteration 2 = 'Sibling'.
    expect(driver.presented).toEqual(['q1', 'q1', 'q1']);
    expect(driver.variablesAt[2]!.loopValue).toBe('Sibling');
    await driver.answer('not at all');

    // The battery rendered THREE times (not collapsed to one).
    expect(driver.presented).toEqual(['q1', 'q1', 'q1']);

    // The run completed once the last iteration was answered (single-page loop).
    expect(completed).not.toBeNull();

    // Three DISTINCT stored responses, each stamped with its iteration + loop value.
    const stored = completed!.responses.filter((r) => r.questionId === 'q1');
    expect(stored).toHaveLength(3);
    expect(stored.map((r) => r.iterationIndex)).toEqual([0, 1, 2]);
    expect(stored.map((r) => r.loopValue)).toEqual(['Mother', 'Father', 'Sibling']);
    expect(stored.map((r) => r.value)).toEqual(['very close', 'somewhat', 'not at all']);

    // Every iteration's answer variable is namespaced and retained (survives complete()).
    const vars = runtime.getVariableEngine().getAllVariables();
    expect(vars.q1__0).toBe('very close');
    expect(vars.q1__1).toBe('somewhat');
    expect(vars.q1__2).toBe('not at all');

    // The per-iteration variables persist into session.variables.
    const persisted = completed!.variables.reduce<Record<string, unknown>>((acc, v) => {
      acc[v.variableId] = v.value;
      return acc;
    }, {});
    expect(persisted.q1__0).toBe('very close');
    expect(persisted.q1__1).toBe('somewhat');
    expect(persisted.q1__2).toBe('not at all');

    runtime.dispose();
  });
});
