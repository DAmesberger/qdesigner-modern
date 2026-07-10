import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ConsentScreen from './ConsentScreen.svelte';

/**
 * R2-5: a blocked consent submit (required fields incomplete) must announce its
 * validation message assertively so screen-reader users hear why they can't proceed.
 * The accept button stays enabled while invalid (an unexplained disabled control gives
 * SR users no feedback); the click reaches the guard, which surfaces the message.
 *
 * The required-signature path exercises the same canAccept guard without the checkbox
 * subcomponent, so the assertive-announcement behaviour is tested in isolation.
 */
describe('ConsentScreen', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('announces the validation error assertively on a failed submit', async () => {
    const onAccept = vi.fn();
    render(ConsentScreen, {
      props: {
        content: '<p>Consent</p>',
        requireSignature: true,
        onAccept,
        onDecline: () => {},
      },
    });

    // No validation message before the participant tries to submit.
    expect(document.querySelector('.error-message')).toBeNull();

    const acceptBtn = document.querySelector(
      '[data-testid="fillout-consent-accept-button"]'
    ) as HTMLButtonElement;
    // Not natively disabled (so the click is not swallowed), but advertises the invalid
    // state via aria-disabled.
    expect(acceptBtn.disabled).toBe(false);
    expect(acceptBtn.getAttribute('aria-disabled')).toBe('true');

    await fireEvent.click(acceptBtn);

    const error = document.querySelector('.error-message');
    expect(error).not.toBeNull();
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('complete all required fields');
    // A failed submit must not call through.
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('accepts once the required field is satisfied', async () => {
    const onAccept = vi.fn();
    render(ConsentScreen, {
      props: {
        content: '<p>Consent</p>',
        requireSignature: true,
        onAccept,
        onDecline: () => {},
      },
    });

    const signature = document.querySelector(
      '[data-testid="fillout-consent-signature"]'
    ) as HTMLInputElement;
    await fireEvent.input(signature, { target: { value: 'Ada Lovelace' } });

    const acceptBtn = document.querySelector(
      '[data-testid="fillout-consent-accept-button"]'
    ) as HTMLButtonElement;
    expect(acceptBtn.getAttribute('aria-disabled')).toBe('false');

    await fireEvent.click(acceptBtn);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
