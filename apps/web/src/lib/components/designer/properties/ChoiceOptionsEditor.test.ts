import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ChoiceOptionsEditor from './ChoiceOptionsEditor.svelte';
import type { Question } from '$lib/shared';
import type { DesignerQuestionUpdate } from './types';

/**
 * ChoiceOptionsEditor is fully prop-driven (questionItem + onApply) — no store,
 * no context. These tests exercise the extracted bulk editor in isolation via the
 * F034 props seam: seeding a single-choice question, editing the textarea, and
 * asserting the blur commits the normalized dual-schema payload through onApply.
 */
function singleChoice(): Question {
  return {
    id: 'q_choice',
    type: 'single-choice',
    order: 0,
    name: '',
    display: { prompt: 'Pick one', options: [{ id: 'opt_1', label: 'Yes', value: '1' }] },
  } as unknown as Question;
}

describe('ChoiceOptionsEditor', () => {
  afterEach(() => cleanup());

  it('emits normalized options for all three dual-schema views on blur', async () => {
    const onApply = vi.fn<(u: DesignerQuestionUpdate) => void>();
    render(ChoiceOptionsEditor, { questionItem: singleChoice(), onApply });

    const textarea = document.querySelector(
      '[data-testid="designer-bulk-option-editor"]'
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    // Draft seeds from the existing option on mount.
    expect(textarea.value).toBe('Yes|1');

    await fireEvent.input(textarea, { target: { value: 'Yes|1|y\nNo|0|n' } });
    await fireEvent.blur(textarea);

    expect(onApply).toHaveBeenCalledTimes(1);
    const payload = onApply.mock.calls[0]![0];

    const expectedOptions = [
      { label: 'Yes', value: '1', key: 'y' },
      { label: 'No', value: '0', key: 'n' },
    ];
    expect(payload.responseType?.options).toEqual(expectedOptions);
    expect(payload.response?.options).toEqual(expectedOptions);
    expect(payload.display?.options).toEqual([
      { id: 'opt_1', label: 'Yes', value: '1', key: 'y' },
      { id: 'opt_2', label: 'No', value: '0', key: 'n' },
    ]);
  });
});
