import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SyncStatusPanel from './SyncStatusPanel.svelte';
import { SyncLedger } from '$lib/fillout/services/integrity/SyncLedger';

/**
 * E-OFF-6: the persistent connectivity widget renders the SyncLedger's pending tally
 * and gates the manual "Sync now" control on connectivity. The panel is presentational
 * (the controller polls the ledger and hands it `pending`), so we source the count from
 * a mocked ledger and feed it in exactly as the controller does.
 */
describe('SyncStatusPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders the pending count sourced from the ledger', async () => {
    vi.spyOn(SyncLedger, 'stats').mockResolvedValue({
      pending: 3,
      acked: 10,
      deadletter: 0,
      total: 13,
    });
    const { pending } = await SyncLedger.stats();

    render(SyncStatusPanel, {
      props: { online: true, syncing: false, pending, lastSyncedAt: null, onSyncNow: () => {} },
    });

    const status = document.querySelector('[data-testid="fillout-sync-status-text"]');
    expect(status?.textContent).toContain('3 answers pending');

    // SR announcement mirrors the pending state (aria-live, P7-T1).
    const announce = document.querySelector('[data-testid="fillout-sync-announce"]');
    expect(announce?.textContent).toContain('3 answers pending');
  });

  it('shows "All saved" with the last-synced time when nothing is pending', () => {
    render(SyncStatusPanel, {
      props: {
        online: true,
        syncing: false,
        pending: 0,
        lastSyncedAt: Date.now(),
        onSyncNow: () => {},
      },
    });

    const status = document.querySelector('[data-testid="fillout-sync-status-text"]');
    expect(status?.textContent).toContain('All saved');
    const meta = document.querySelector('[data-testid="fillout-sync-last-synced"]');
    expect(meta?.textContent).toContain('just now');
  });

  it('enables Sync-now when online and disables it (with a tooltip) when offline', async () => {
    const { rerender } = render(SyncStatusPanel, {
      props: { online: true, syncing: false, pending: 2, lastSyncedAt: null, onSyncNow: () => {} },
    });

    const btn = () =>
      document.querySelector('[data-testid="fillout-sync-now"]') as HTMLButtonElement;
    expect(btn().disabled).toBe(false);
    expect(btn().getAttribute('title')).toBeNull();

    await rerender({
      online: false,
      syncing: false,
      pending: 2,
      lastSyncedAt: null,
      onSyncNow: () => {},
    });
    expect(btn().disabled).toBe(true);
    expect(btn().getAttribute('title')).toBeTruthy();
  });

  it('disables Sync-now while a drain is in flight', () => {
    render(SyncStatusPanel, {
      props: { online: true, syncing: true, pending: 1, lastSyncedAt: null, onSyncNow: () => {} },
    });
    const btn = document.querySelector('[data-testid="fillout-sync-now"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // R2-3: a permanent-failure (dead-letter) count must surface as an honest, destructive,
  // non-dismissible error state — never a silent "all saved".
  it('enters the destructive error state when deadletter > 0', () => {
    render(SyncStatusPanel, {
      props: {
        online: true,
        syncing: false,
        pending: 0,
        deadletter: 2,
        lastSyncedAt: Date.now(),
        onSyncNow: () => {},
      },
    });

    const panel = document.querySelector('[data-testid="fillout-sync-panel"]');
    expect(panel?.getAttribute('data-state')).toBe('error');

    const status = document.querySelector('[data-testid="fillout-sync-status-text"]');
    expect(status?.textContent).toContain('2 answers could not be submitted');

    // The failure outranks the "last synced" meta — success chrome must not show.
    expect(document.querySelector('[data-testid="fillout-sync-last-synced"]')).toBeNull();
    // Terminal by design: no re-queue exists, so there is no Sync-now/retry control.
    expect(document.querySelector('[data-testid="fillout-sync-now"]')).toBeNull();
  });

  it('announces the failure assertively (role="alert") and only in the error state', async () => {
    const { rerender } = render(SyncStatusPanel, {
      props: {
        online: true,
        syncing: false,
        pending: 1,
        deadletter: 0,
        lastSyncedAt: null,
        onSyncNow: () => {},
      },
    });

    // Routine states stay polite.
    let announce = document.querySelector('[data-testid="fillout-sync-announce"]');
    expect(announce?.getAttribute('role')).toBe('status');
    expect(announce?.getAttribute('aria-live')).toBe('polite');

    await rerender({
      online: true,
      syncing: false,
      pending: 0,
      deadletter: 3,
      lastSyncedAt: null,
      onSyncNow: () => {},
    });

    announce = document.querySelector('[data-testid="fillout-sync-announce"]');
    expect(announce?.getAttribute('role')).toBe('alert');
    expect(announce?.getAttribute('aria-live')).toBe('assertive');
    expect(announce?.textContent).toContain('3 answers could not be submitted');
  });

  it('offers the export escape hatch in the error state and invokes onExport', async () => {
    const onExport = vi.fn();
    render(SyncStatusPanel, {
      props: {
        online: true,
        syncing: false,
        pending: 0,
        deadletter: 1,
        lastSyncedAt: null,
        onSyncNow: () => {},
        onExport,
      },
    });

    const btn = document.querySelector(
      '[data-testid="fillout-sync-export"]'
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
