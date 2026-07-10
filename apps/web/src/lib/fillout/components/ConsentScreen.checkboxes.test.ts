import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ConsentScreen from './ConsentScreen.svelte';

/**
 * Regression (F-44): authoring consent checkboxes became reachable for the first
 * time via the designer's Study settings panel. ConsentScreen previously seeded
 * `checkboxStates` only in an $effect, so the first render bound `undefined` into
 * the child Checkbox (which has a `$bindable(false)` fallback) and threw
 * `props_invalid_value` in dev mode — crashing any consent screen that carried
 * checkboxes. State is now seeded synchronously; these tests render WITH checkboxes
 * and assert the render is clean and the required-checkbox gate works.
 */
describe('ConsentScreen with checkboxes (F-44 regression)', () => {
  afterEach(() => cleanup());

  it('renders a checkbox-bearing consent screen without throwing', () => {
    expect(() =>
      render(ConsentScreen, {
        props: {
          content: '<p>Participation is voluntary.</p>',
          checkboxes: [
            { id: 'cb-1', label: 'I have read the information.', required: true },
            { id: 'cb-2', label: 'I consent to data processing.', required: false },
          ],
          onAccept: () => {},
          onDecline: () => {},
        },
      })
    ).not.toThrow();

    const screen = document.querySelector('[data-testid="fillout-consent-screen"]');
    expect(screen?.textContent).toContain('I have read the information.');
    expect(screen?.textContent).toContain('I consent to data processing.');
  });

  it('gates accept on the required checkbox and calls through once ticked', async () => {
    let accepted: unknown = null;
    render(ConsentScreen, {
      props: {
        content: '<p>Consent</p>',
        checkboxes: [{ id: 'cb-1', label: 'I agree to participate.', required: true }],
        onAccept: (data: unknown) => (accepted = data),
        onDecline: () => {},
      },
    });

    const acceptBtn = document.querySelector(
      '[data-testid="fillout-consent-accept-button"]'
    ) as HTMLButtonElement;

    // Required checkbox unticked → invalid; a click must not call through.
    expect(acceptBtn.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(acceptBtn);
    expect(accepted).toBeNull();

    // Tick the required checkbox → valid → click calls onAccept with its state.
    const cb = document.querySelector(
      '.consent-checkboxes input[type="checkbox"]'
    ) as HTMLInputElement;
    await fireEvent.click(cb);
    expect(acceptBtn.getAttribute('aria-disabled')).toBe('false');

    await fireEvent.click(acceptBtn);
    expect(accepted).toMatchObject({ accepted: true, checkboxes: { 'cb-1': true } });
  });
});
