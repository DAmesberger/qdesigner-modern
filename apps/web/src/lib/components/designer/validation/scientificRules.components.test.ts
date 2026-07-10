import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import AdaptiveBlockEditor from '../AdaptiveBlockEditor.svelte';
import StandardParadigmFields from '$lib/modules/questions/reaction-time/designer/StandardParadigmFields.svelte';
import QuotaPanel from '../QuotaPanel.svelte';
import { designerStore } from '$lib/stores/designer.svelte';
import type { Question } from '$lib/shared';

// Svelte transitions used by the Dialog need the Web Animations API jsdom lacks.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({ cancel() {}, finish() {}, onfinish: null, finished: Promise.resolve() });
  }
});

afterEach(() => cleanup());

describe('AdaptiveBlockEditor inline validation', () => {
  // Minimal fixture — AdaptiveBlockEditor only reads `display.prompt`/`name`/`id`
  // off each question for its item labels, so a full response config is noise here.
  const question = {
    id: 'q1',
    type: 'text-input',
    name: '',
    order: 0,
    required: false,
    display: { prompt: 'Item 1' },
  } as unknown as Question;

  it('shows an error message for a non-positive discrimination (a)', () => {
    const { getByText } = render(AdaptiveBlockEditor, {
      config: { items: [{ id: 'q1', a: 0, b: 0, c: 0 }] },
      questionIds: ['q1'],
      allQuestions: [question],
    });
    expect(getByText(/Discrimination \(a\) must be greater than 0/)).toBeTruthy();
  });

  it('is clean for conventional 3PL parameters', () => {
    const { queryByText } = render(AdaptiveBlockEditor, {
      config: { items: [{ id: 'q1', a: 1.2, b: 0.3, c: 0.1 }] },
      questionIds: ['q1'],
      allQuestions: [question],
    });
    expect(queryByText(/Discrimination \(a\) must be greater than 0/)).toBeNull();
  });
});

describe('StandardParadigmFields inline validation', () => {
  // Minimal PVT config — the component only reads `task.pvt` for this branch.
  const pvtQuestion = (min: number, max: number) =>
    ({
      id: 'q1',
      type: 'reaction-time',
      name: '',
      config: {
        task: {
          type: 'pvt',
          pvt: { trialCount: 20, minIsiMs: min, maxIsiMs: max, responseKey: ' ', responseTimeoutMs: 3000 },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal fixture for one branch
    }) as any;

  it('flags a min ISI above the max ISI', () => {
    const { getByText } = render(StandardParadigmFields, { question: pvtQuestion(10000, 2000) });
    expect(getByText(/ISI: minimum cannot exceed the maximum/)).toBeTruthy();
  });

  it('shows no ISI error for an ordered window', () => {
    const { queryByText } = render(StandardParadigmFields, { question: pvtQuestion(2000, 10000) });
    expect(queryByText(/minimum cannot exceed the maximum/)).toBeNull();
  });
});

describe('QuotaPanel condition validation blocks save', () => {
  function seedQuota(condition: string) {
    designerStore.loadQuestionnaireFromDefinition({
      id: 'qn-quota',
      name: 'Quota Test',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      questions: [],
      settings: {
        quotas: [
          {
            id: 'g1',
            name: 'Group 1',
            logic: 'independent',
            variables: [],
            quotas: [
              {
                id: 'quota1',
                name: 'Quota 1',
                target: 50,
                condition,
                overQuotaAction: 'terminate',
                overQuotaMessage: 'Full.',
                enabled: true,
              },
            ],
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial definition fixture
    } as any);
  }

  it('disables Save and shows an error for an unparseable condition', async () => {
    seedQuota('age >=');
    const { getByTestId, getByText } = render(QuotaPanel, { open: true });
    expect(getByText(/at position/)).toBeTruthy();
    expect((getByTestId('quota-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Save for a well-formed condition', async () => {
    seedQuota('age >= 18');
    const { getByTestId } = render(QuotaPanel, { open: true });
    expect((getByTestId('quota-save') as HTMLButtonElement).disabled).toBe(false);
  });
});
