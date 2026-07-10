import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';
import HidConnectAffordance from './HidConnectAffordance.svelte';

/** Install a stub `navigator.hid`; returns a restore function. */
function stubHid(hid: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'hid');
  Object.defineProperty(navigator, 'hid', { value: hid, configurable: true });
  return () => {
    if (original) Object.defineProperty(navigator, 'hid', original);
    else delete (navigator as { hid?: unknown }).hid;
  };
}

describe('HidConnectAffordance (RT-4)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restore?.();
    restore = null;
  });

  it('renders nothing when the study does not need a HID device', () => {
    restore = stubHid({ getDevices: async () => [] });
    render(HidConnectAffordance, { props: { needsHid: false } });
    expect(document.querySelector('[data-testid="fillout-hid-connect"]')).toBeNull();
  });

  it('shows the keyboard/touch fallback message on a browser without WebHID', () => {
    restore = stubHid(undefined); // Safari/Firefox: no navigator.hid
    render(HidConnectAffordance, { props: { needsHid: true } });

    const unsupported = document.querySelector('[data-testid="fillout-hid-unsupported"]');
    expect(unsupported).not.toBeNull();
    expect(unsupported?.textContent).toContain('Chrome or Edge');
    // No connect button is offered when unsupported.
    expect(document.querySelector('[data-testid="fillout-hid-connect-button"]')).toBeNull();
  });

  it('offers a connect button when WebHID is supported and no device is granted yet', async () => {
    restore = stubHid({ getDevices: async () => [] });
    render(HidConnectAffordance, { props: { needsHid: true } });

    await waitFor(() => {
      expect(document.querySelector('[data-testid="fillout-hid-connect-button"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-testid="fillout-hid-unsupported"]')).toBeNull();
  });
});
