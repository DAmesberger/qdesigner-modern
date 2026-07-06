import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConfirmDialogHost from './ConfirmDialogHost.svelte';
import { confirmDialog, confirmState } from '$lib/stores/confirm.svelte';

// jsdom lacks the Web Animations API Svelte transitions reach for.
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

describe('confirmDialog', () => {
  afterEach(() => {
    // Reset shared module state between tests.
    if (confirmState.resolve) confirmState.resolve(false);
    confirmState.open = false;
    confirmState.resolve = null;
    cleanup();
  });

  it('resolves true when the confirm button is clicked', async () => {
    render(ConfirmDialogHost);

    const promise = confirmDialog({ title: 'Delete?', confirmLabel: 'Delete', destructive: true });
    await tick();

    const confirmButton = document.querySelector(
      '[data-testid="confirm-dialog-confirm"]'
    ) as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    await fireEvent.click(confirmButton);

    await expect(promise).resolves.toBe(true);
    expect(confirmState.open).toBe(false);
  });

  it('resolves false when the cancel button is clicked', async () => {
    render(ConfirmDialogHost);

    const promise = confirmDialog({ title: 'Delete?' });
    await tick();

    const cancelButton = document.querySelector(
      '[data-testid="confirm-dialog-cancel"]'
    ) as HTMLButtonElement;
    expect(cancelButton).toBeTruthy();
    await fireEvent.click(cancelButton);

    await expect(promise).resolves.toBe(false);
    expect(confirmState.open).toBe(false);
  });

  it('resolves false when Escape is pressed (backdrop/keyboard dismissal)', async () => {
    render(ConfirmDialogHost);

    const promise = confirmDialog({ title: 'Delete?' });
    await tick();

    await fireEvent.keyDown(window, { key: 'Escape' });

    await expect(promise).resolves.toBe(false);
    expect(confirmState.open).toBe(false);
  });
});
