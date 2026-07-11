import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import TextInput from '$lib/modules/questions/text-input/TextInput.svelte';
import NumberInput from '$lib/modules/questions/number-input/NumberInput.svelte';

/**
 * Modules own validity (ADR 0029, issue #33): a form module reports `{ valid, errors }`
 * alongside each response so the fillout host can gate Continue on constraint violations.
 * These prove the report carries the right verdict, that NumberInput no longer silently
 * rewrites an out-of-range value on blur, and — because they render with a DEFINED
 * `onValidation` on the invalid path — they also guard against the update-depth loop that
 * a non-idempotent validation effect reintroduces once the channel is wired.
 */

/** The most-recent `onValidation` verdict, or null if it was never called. */
function lastValidation(
  onValidation: ReturnType<typeof vi.fn>
): { valid: boolean; errors: string[] } | null {
  const call = onValidation.mock.calls.at(-1);
  return call ? (call[0] as { valid: boolean; errors: string[] }) : null;
}

describe('TextInput constraint reporting (ADR 0029)', () => {
  afterEach(() => cleanup());

  function renderText(config: Record<string, unknown>) {
    const onValidation = vi.fn();
    const onResponse = vi.fn();
    render(TextInput, {
      props: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture question shape
        question: { id: 'q_text', type: 'text-input', config: { inputType: 'text', ...config } } as any,
        mode: 'runtime',
        onValidation,
        onResponse,
      },
    });
    const input = document.querySelector('.text-input') as HTMLInputElement;
    return { input, onValidation, onResponse };
  }

  it('reports invalid for a value below minLength and valid once satisfied', async () => {
    const { input, onValidation } = renderText({ minLength: 5 });

    await fireEvent.input(input, { target: { value: 'ab' } });
    expect(lastValidation(onValidation)).toMatchObject({ valid: false });

    await fireEvent.input(input, { target: { value: 'abcdef' } });
    expect(lastValidation(onValidation)).toMatchObject({ valid: true });
  });

  it('treats an empty optional value as valid (emptiness is required-presence, handled centrally)', async () => {
    const { input, onValidation } = renderText({ minLength: 5 });
    // The mount-time effect validates '' — an empty value must not trip minLength.
    await fireEvent.input(input, { target: { value: '' } });
    expect(lastValidation(onValidation)).toMatchObject({ valid: true });
  });

  it('reports invalid for a malformed email and valid once corrected', async () => {
    const { input, onValidation } = renderText({ inputType: 'email' });
    await fireEvent.input(input, { target: { value: 'not-an-email' } });
    expect(lastValidation(onValidation)).toMatchObject({ valid: false });
    await fireEvent.input(input, { target: { value: 'a@b.co' } });
    expect(lastValidation(onValidation)).toMatchObject({ valid: true });
  });
});

describe('NumberInput out-of-range reporting + no clamp (ADR 0029)', () => {
  afterEach(() => cleanup());

  function renderNumber(config: Record<string, unknown>) {
    const onValidation = vi.fn();
    const onResponse = vi.fn();
    render(NumberInput, {
      props: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture question shape
        question: { id: 'q_num', type: 'number-input', config } as any,
        mode: 'runtime',
        onValidation,
        onResponse,
      },
    });
    const input = document.querySelector('.number-input') as HTMLInputElement;
    return { input, onValidation, onResponse };
  }

  it('reports invalid for a value above max and never rewrites the typed value on blur', async () => {
    const { input, onValidation, onResponse } = renderNumber({ min: 0, max: 100 });

    await fireEvent.input(input, { target: { value: '999' } });
    expect(lastValidation(onValidation)).toMatchObject({ valid: false });
    expect(onResponse.mock.calls.at(-1)?.[0]).toBe(999);

    // Blur must NOT clamp to the bound — the persisted value stays literally what was typed.
    await fireEvent.blur(input);
    expect(onResponse.mock.calls.at(-1)?.[0]).toBe(999);
    expect(input.value).toBe('999');
    expect(lastValidation(onValidation)).toMatchObject({ valid: false });
  });

  it('reports valid for an in-range value', async () => {
    const { input, onValidation } = renderNumber({ min: 0, max: 100 });
    await fireEvent.input(input, { target: { value: '42' } });
    expect(lastValidation(onValidation)).toMatchObject({ valid: true });
  });
});
