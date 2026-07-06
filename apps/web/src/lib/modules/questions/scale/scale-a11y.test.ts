import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Scale from './Scale.svelte';

/**
 * A11y contract (F100) for the Scale module. The old container carried an
 * invalid `role="slider"` around focusable buttons and reported `aria-valuenow`
 * as `value || min` (so an unanswered scale lied about its value). This suite
 * pins the refactor: discrete variants (buttons/stars) are a `radiogroup` of
 * `role="radio"` children, and continuous variants (slider/visual-analog) rely
 * on the native range input's implicit slider role — exactly one per instance.
 */
function scaleQuestion(displayType: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'q_scale',
    type: 'scale',
    config: {
      min: 1,
      max: 5,
      step: 1,
      displayType,
      ...extra,
    },
  } as any;
}

describe('Scale a11y', () => {
  afterEach(() => cleanup());

  it('buttons variant renders a radiogroup with radio children', () => {
    const { getByRole, getAllByRole } = render(Scale, {
      props: { question: scaleQuestion('buttons'), mode: 'runtime', value: null },
    });

    expect(getByRole('radiogroup')).toBeTruthy();
    const radios = getAllByRole('radio');
    expect(radios).toHaveLength(5);
    // No radio is checked before a selection.
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('aria-checked follows selection and click fires onResponse', async () => {
    const onResponse = vi.fn();
    const { getAllByRole } = render(Scale, {
      props: { question: scaleQuestion('buttons'), mode: 'runtime', value: null, onResponse },
    });

    const radios = getAllByRole('radio');
    await fireEvent.click(radios[2]!); // point === 3

    expect(onResponse).toHaveBeenCalledWith(3);
    expect(radios[2]!.getAttribute('aria-checked')).toBe('true');
    expect(radios[0]!.getAttribute('aria-checked')).toBe('false');
  });

  it('slider variant exposes exactly one slider role (the native range input)', () => {
    const { getAllByRole, queryByRole } = render(Scale, {
      props: { question: scaleQuestion('slider'), mode: 'runtime', value: null },
    });

    expect(queryByRole('radiogroup')).toBeNull();
    const sliders = getAllByRole('slider');
    expect(sliders).toHaveLength(1);
    expect((sliders[0] as HTMLInputElement).type).toBe('range');
  });
});
