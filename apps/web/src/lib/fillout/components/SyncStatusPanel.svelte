<script lang="ts">
  import { m } from '$lib/paraglide/messages';

  /**
   * Persistent participant connectivity widget (E-OFF-6). Replaces the auto-hiding
   * status badge with an honest, always-visible readout: online/offline, how many
   * answers are still queued locally, when the last successful sync happened, and a
   * manual "Sync now" control. Purely presentational — the pending count is sourced
   * upstream from the SyncLedger stats the controller polls, and "Sync now" delegates
   * to the FilloutUploadSync engine via {@link onSyncNow}. Strings go through Paraglide
   * (offline-safe, compiled) and all color comes from semantic tokens so the widget is
   * theme-aware without raw HSL triplets (avoids the F020-class regression).
   */
  interface Props {
    online: boolean;
    syncing: boolean;
    /** Records durably queued locally but not yet acknowledged by the server. */
    pending: number;
    /**
     * Records the sync pipeline PERMANENTLY rejected (SyncLedger dead-letter, E-OFF-5).
     * Non-zero means silent data loss unless surfaced — it flips the panel into a
     * destructive, non-dismissible error state (R2-3). Dead-letter is terminal by
     * design (the ledger never re-queues it), so the only recovery is the export
     * escape hatch — there is deliberately no "retry" here.
     */
    deadletter?: number;
    /** Epoch ms of the last fully-successful sync, or null if none this session. */
    lastSyncedAt: number | null;
    onSyncNow: () => void;
    /** Download a JSON snapshot of unsynced/failed answers (E-OFF-5 escape hatch). */
    onExport?: () => void;
  }

  let {
    online,
    syncing,
    pending,
    deadletter = 0,
    lastSyncedAt,
    onSyncNow,
    onExport,
  }: Props = $props();

  // "just now" for a sync within the last minute, else a wall-clock HH:MM. Not
  // auto-ticking — good enough to read "last synced just now" right after a drain.
  const lastSyncedLabel = $derived.by(() => {
    if (lastSyncedAt === null) return null;
    if (Date.now() - lastSyncedAt < 60_000) return m.fillout_sync_last_synced_now();
    const time = new Date(lastSyncedAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return m.fillout_sync_last_synced({ time });
  });

  // Visible primary status line. A dead-letter (permanent-failure) count outranks every
  // other state — silent data loss is the most important thing to say (R2-3).
  const statusText = $derived.by(() => {
    if (deadletter > 0) return m.fillout_sync_failed({ count: deadletter });
    if (syncing) return m.fillout_sync_syncing();
    if (!online) return m.fillout_sync_offline();
    if (pending > 0) return m.fillout_sync_pending({ count: pending });
    return m.fillout_sync_all_saved();
  });

  // Screen-reader announcement — failure (assertive) / "N answers pending" / "all saved"
  // (F094/P7-T1, R2-3).
  const announcement = $derived(
    deadletter > 0
      ? m.fillout_sync_announce_failed({ count: deadletter })
      : pending > 0
        ? m.fillout_sync_announce_pending({ count: pending })
        : m.fillout_sync_announce_all_saved()
  );

  const state = $derived(
    deadletter > 0
      ? 'error'
      : !online
        ? 'offline'
        : syncing
          ? 'syncing'
          : pending > 0
            ? 'pending'
            : 'saved'
  );
  const syncDisabled = $derived(!online || syncing);
</script>

<div class="sync-panel" data-testid="fillout-sync-panel" data-state={state}>
  <!-- Failure must interrupt (role="alert" / assertive); the routine pending/saved
       transitions stay polite so they don't nag (R2-3). -->
  {#if state === 'error'}
    <span class="sr-only" role="alert" aria-live="assertive" data-testid="fillout-sync-announce">
      {announcement}
    </span>
  {:else}
    <span class="sr-only" role="status" aria-live="polite" data-testid="fillout-sync-announce">
      {announcement}
    </span>
  {/if}

  <span class="sync-dot" aria-hidden="true"></span>

  <span class="sync-text">
    <span class="sync-primary" data-testid="fillout-sync-status-text">{statusText}</span>
    {#if lastSyncedLabel && state === 'saved'}
      <span class="sync-meta" data-testid="fillout-sync-last-synced">· {lastSyncedLabel}</span>
    {/if}
  </span>

  {#if state === 'error'}
    <!-- Terminal failure: no re-queue exists, so the recovery is the export escape hatch. -->
    {#if onExport}
      <button
        type="button"
        class="sync-export"
        data-testid="fillout-sync-export"
        onclick={() => onExport?.()}
      >
        {m.fillout_sync_export_failed()}
      </button>
    {/if}
  {:else}
    <button
      type="button"
      class="sync-now"
      data-testid="fillout-sync-now"
      disabled={syncDisabled}
      title={!online ? m.fillout_sync_now_offline_tooltip() : undefined}
      aria-label={m.fillout_sync_now()}
      onclick={() => onSyncNow()}
    >
      <svg
        class="sync-now-icon"
        class:spinning={syncing}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      <span>{m.fillout_sync_now()}</span>
    </button>
  {/if}
</div>

<style>
  .sync-panel {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem 0.375rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    background: hsl(var(--card) / 0.92);
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.1);
    backdrop-filter: blur(8px);
    pointer-events: auto;
    max-width: calc(100vw - 1.5rem);
  }

  .sync-dot {
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: hsl(var(--muted-foreground));
  }

  .sync-panel[data-state='saved'] .sync-dot {
    background: hsl(var(--success));
  }
  .sync-panel[data-state='syncing'] .sync-dot {
    background: hsl(var(--primary));
    animation: sync-pulse 1s ease-in-out infinite;
  }
  .sync-panel[data-state='pending'] .sync-dot {
    background: hsl(var(--warning));
  }
  .sync-panel[data-state='offline'] .sync-dot {
    background: hsl(var(--muted-foreground));
  }

  /* Permanent-failure (dead-letter) state: destructive, unmissable, non-dismissible. */
  .sync-panel[data-state='error'] {
    background: hsl(var(--destructive) / 0.12);
    border-color: hsl(var(--destructive) / 0.5);
    color: hsl(var(--destructive));
    font-weight: 600;
  }
  .sync-panel[data-state='error'] .sync-dot {
    background: hsl(var(--destructive));
  }

  .sync-text {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sync-meta {
    color: hsl(var(--muted-foreground));
    font-weight: 400;
  }

  .sync-now {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    flex-shrink: 0;
    padding: 0.25rem 0.625rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .sync-now:hover:not(:disabled) {
    opacity: 0.85;
  }

  .sync-now:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .sync-export {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0.25rem 0.625rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--destructive));
    background: hsl(var(--destructive));
    color: hsl(var(--destructive-foreground));
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .sync-export:hover {
    opacity: 0.85;
  }

  .sync-now-icon {
    width: 0.875rem;
    height: 0.875rem;
  }

  .sync-now-icon.spinning {
    animation: sync-spin 1s linear infinite;
  }

  @keyframes sync-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes sync-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sync-now-icon.spinning,
    .sync-panel[data-state='syncing'] .sync-dot {
      animation: none;
    }
  }
</style>
