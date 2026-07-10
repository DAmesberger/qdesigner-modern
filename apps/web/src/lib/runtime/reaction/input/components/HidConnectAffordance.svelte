<script lang="ts">
  /**
   * HidConnectAffordance — optional "connect your response device" control shown
   * on the study welcome screen (RT-4, ADR 0024).
   *
   * Appears ONLY when the study binds a HID response (the `needsHid` prop, derived
   * from the definition via `definitionNeedsHid`). It is always optional: the
   * participant can ignore it and answer with the keyboard/touch bindings the same
   * options carry. On a non-Chromium browser (no WebHID) it explains the fallback
   * instead of offering a dead button. A device granted on a previous visit is
   * reconnected silently on mount via `navigator.hid.getDevices()`.
   *
   * Self-contained: it drives the session-wide {@link HidDeviceManager} directly,
   * so the welcome screen only needs to pass `needsHid` — no wiring through the
   * fillout controller.
   */
  import { HidDeviceManager } from '../HidDeviceManager';

  interface Props {
    /** Whether the study actually binds a HID response (else render nothing). */
    needsHid: boolean;
  }

  let { needsHid }: Props = $props();

  const manager = HidDeviceManager.shared();

  let supported = $state(false);
  let connected = $state(false);
  let deviceName = $state<string | null>(null);
  let busy = $state(false);
  let failed = $state(false);

  function syncState(): void {
    connected = manager.hasDevice();
    deviceName = manager.deviceName();
  }

  $effect(() => {
    if (!needsHid) return;
    supported = manager.isSupported();
    if (!supported) return;
    // Reconnect a previously-granted device without a gesture.
    void manager.restore().then(() => syncState());
  });

  async function connect(): Promise<void> {
    if (busy) return;
    busy = true;
    failed = false;
    try {
      const ok = await manager.requestDevice();
      failed = !ok;
      syncState();
    } finally {
      busy = false;
    }
  }
</script>

{#if needsHid}
  <div class="hid-connect" data-testid="fillout-hid-connect">
    {#if !supported}
      <p class="hid-note hid-note-fallback" data-testid="fillout-hid-unsupported" role="note">
        This study can use a hardware response device (button box), which needs Chrome or Edge. On
        this browser you can respond with the keyboard or by tapping instead.
      </p>
    {:else if connected}
      <p class="hid-note hid-note-ok" data-testid="fillout-hid-connected" role="status">
        <svg class="hid-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Response device connected{deviceName ? ` (${deviceName})` : ''}.
      </p>
    {:else}
      <button
        type="button"
        class="hid-button"
        data-testid="fillout-hid-connect-button"
        onclick={connect}
        disabled={busy}
      >
        {busy ? 'Connecting…' : 'Connect response device'}
      </button>
      <p class="hid-note" data-testid="fillout-hid-hint">
        Optional — connect a hardware button box now, or just use the keyboard/touch.
      </p>
      {#if failed}
        <p class="hid-note hid-note-warn" data-testid="fillout-hid-failed" role="status">
          No device was connected. You can try again or continue with the keyboard/touch.
        </p>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .hid-connect {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .hid-button {
    padding: 0.375rem 0.875rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--border));
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .hid-button:hover:not(:disabled) {
    color: hsl(var(--foreground));
    border-color: hsl(var(--foreground) / 0.4);
  }

  .hid-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .hid-note {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: hsl(var(--muted-foreground));
    max-width: 30rem;
    text-align: center;
  }

  .hid-note-ok {
    color: hsl(var(--foreground));
    font-weight: 500;
  }

  .hid-note-warn,
  .hid-note-fallback {
    color: hsl(var(--foreground));
  }

  .hid-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
</style>
