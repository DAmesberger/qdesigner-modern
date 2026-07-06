<script lang="ts">
  import { m } from '$lib/paraglide/messages';

  /**
   * Shared/kiosk "Save & exit (clear this device)" control (E-OFF-6 step 3).
   *
   * A participant on a shared research device needs a safe hand-off: force a final
   * sync, then wipe every fillout store (E-OFF-2/E-OFF-3 {@link onClear}) so no
   * residual PII or key material lingers. If unsynced rows survive the final sync
   * (offline, or the server rejected some), we do NOT silently discard them — the
   * participant is warned, offered the E-OFF-5 export escape hatch, and must
   * explicitly confirm "Clear anyway".
   *
   * The interaction state lives here; the destructive/network primitives are injected
   * so they stay atomic and unit-testable. Strings are Paraglide (offline-safe) and
   * colors are semantic tokens (theme-aware).
   */
  interface Props {
    online: boolean;
    /** Count of locally-stored rows not yet acknowledged by the server. */
    countUnsynced: () => Promise<number>;
    /** Force a final sync drain (no-op when offline). */
    onSync: () => Promise<void>;
    /** Destructive wipe of all fillout stores + keys + media cache. */
    onClear: () => Promise<void>;
    /** Download a JSON snapshot of unsynced data (recovery escape hatch). */
    onExport: () => Promise<void>;
  }

  let { online, countUnsynced, onSync, onClear, onExport }: Props = $props();

  type Phase = 'idle' | 'working' | 'confirm' | 'done';
  let phase = $state<Phase>('idle');
  let unsyncedCount = $state(0);
  let exporting = $state(false);
  let exported = $state(false);

  async function begin() {
    phase = 'working';
    try {
      if (online) {
        // Best-effort final drain; never blocks the exit on a sync failure.
        await onSync().catch(() => {});
      }
      unsyncedCount = await countUnsynced().catch(() => 0);
      if (unsyncedCount > 0) {
        // Unsynced rows survive — require explicit confirmation + offer export first.
        phase = 'confirm';
        return;
      }
      await onClear();
      phase = 'done';
    } catch {
      // A failed clear drops back to idle so the participant can retry.
      phase = 'idle';
    }
  }

  async function exportNow() {
    exporting = true;
    try {
      await onExport();
      exported = true;
    } catch {
      // Non-fatal: the confirm/clear path stays available.
    } finally {
      exporting = false;
    }
  }

  async function clearAnyway() {
    phase = 'working';
    try {
      await onClear();
      phase = 'done';
    } catch {
      phase = 'confirm';
    }
  }

  function cancel() {
    phase = 'idle';
    exported = false;
  }
</script>

<div class="share-exit" data-testid="fillout-share-exit">
  {#if phase === 'done'}
    <p class="share-exit-done" role="status" data-testid="fillout-share-exit-done">
      {m.fillout_share_exit_done()}
    </p>
  {:else if phase === 'confirm'}
    <div class="share-exit-confirm" data-testid="fillout-share-exit-confirm">
      <p class="share-exit-warning" data-testid="fillout-share-exit-warning">
        {m.fillout_share_exit_unsynced_warning({ count: unsyncedCount })}
      </p>
      <p class="share-exit-note">{m.fillout_share_exit_confirm_note()}</p>
      <div class="share-exit-actions">
        <button
          type="button"
          class="share-exit-btn"
          data-testid="fillout-share-exit-export"
          disabled={exporting}
          onclick={exportNow}
        >
          {exported ? '✓ ' : ''}{m.fillout_share_exit_export()}
        </button>
        <button
          type="button"
          class="share-exit-btn danger"
          data-testid="fillout-share-exit-clear-anyway"
          onclick={clearAnyway}
        >
          {m.fillout_share_exit_clear_anyway()}
        </button>
        <button
          type="button"
          class="share-exit-btn"
          data-testid="fillout-share-exit-cancel"
          onclick={cancel}
        >
          {m.fillout_share_exit_cancel()}
        </button>
      </div>
    </div>
  {:else}
    <button
      type="button"
      class="share-exit-btn"
      data-testid="fillout-share-exit-btn"
      disabled={phase === 'working'}
      onclick={begin}
    >
      {phase === 'working' ? m.fillout_share_exit_busy() : m.fillout_share_exit_button()}
    </button>
  {/if}
</div>

<style>
  .share-exit {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
  }

  .share-exit-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
  }

  .share-exit-warning {
    color: hsl(var(--warning));
    font-size: 0.8125rem;
    line-height: 1.4;
    font-weight: 500;
  }

  .share-exit-note {
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .share-exit-done {
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
  }

  .share-exit-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .share-exit-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .share-exit-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .share-exit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .share-exit-btn.danger {
    background: hsl(var(--destructive));
    color: hsl(var(--destructive-foreground));
    border-color: hsl(var(--destructive));
  }
</style>
