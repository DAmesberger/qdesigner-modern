import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import MultipleChoice from '$lib/modules/questions/multiple-choice/MultipleChoice.svelte';
import Matrix from '$lib/modules/questions/matrix/Matrix.svelte';
import type { Question } from '@qdesigner/questionnaire-core';
import { buildModuleRuntimeConfig } from './moduleConfigAdapter';

// jsdom lacks the Web Animations API used by Svelte's `animate:flip`.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({
      cancel() {},
      finish() {},
      onfinish: null,
      finished: Promise.resolve(),
    });
  }
});

/**
 * Proves the hybrid fillout rendering contract (ADR 0018): a stored question,
 * adapted into module `config`, mounts its real runtime component and captures a
 * response through onResponse — the path the fillout overlay wires into the runtime.
 */
describe('fillout form-question response capture', () => {
  afterEach(() => cleanup());

  it('captures a single-choice response from the mounted MultipleChoice component', async () => {
    const question = {
      id: 'q_single',
      type: 'single-choice',
      display: {
        prompt: 'Pick a fruit',
        options: [
          { id: 'a', label: 'Apple', value: 'apple' },
          { id: 'b', label: 'Banana', value: 'banana' },
        ],
      },
      responseType: { type: 'single' },
    };

    const onResponse = vi.fn();
    render(MultipleChoice, {
      props: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture question shape
        question: { ...question, config: buildModuleRuntimeConfig(question as Question) } as any,
        mode: 'runtime',
        onResponse,
      },
    });

    const banana = document.querySelector('input[aria-label="Banana"]') as HTMLInputElement;
    expect(banana).toBeTruthy();
    await fireEvent.click(banana);

    expect(onResponse).toHaveBeenCalled();
    expect(onResponse.mock.calls.at(-1)?.[0]).toBe('banana');
  });

  it('captures a matrix response (rowId -> column value) from the mounted Matrix component', async () => {
    const question = {
      id: 'q_matrix',
      type: 'matrix',
      display: {
        prompt: 'Rate each',
        rows: [{ id: 'r1', label: 'Taste' }],
        columns: [
          { id: 'c1', label: 'Bad', value: 1 },
          { id: 'c2', label: 'Good', value: 2 },
        ],
        responseType: 'single',
      },
    };

    const onResponse = vi.fn();
    render(Matrix, {
      props: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture question shape
        question: { ...question, config: buildModuleRuntimeConfig(question as Question) } as any,
        mode: 'runtime',
        onResponse,
      },
    });

    const radios = document.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    // Select the "Good" (value 2) cell for row r1.
    await fireEvent.click(radios[1] as HTMLInputElement);

    expect(onResponse).toHaveBeenCalled();
    const lastValue = onResponse.mock.calls.at(-1)?.[0];
    expect(lastValue).toMatchObject({ r1: 2 });
  });
});
