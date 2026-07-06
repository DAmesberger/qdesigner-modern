<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { confirmState, _confirm, _cancel } from '$lib/stores/confirm.svelte';

  // Mounted once (routes/+layout.svelte). Backdrop/Escape/X all route through
  // Dialog's onclose, which we treat as a cancel so the promise resolves false.
</script>

<Dialog
  bind:open={confirmState.open}
  title={confirmState.title}
  size="sm"
  closable
  closeOnEscape
  closeOnBackdrop
  onclose={_cancel}
>
  {#if confirmState.message}
    <p class="text-sm text-muted-foreground">{confirmState.message}</p>
  {/if}

  {#snippet footer()}
    <Button variant="outline" onclick={_cancel} data-testid="confirm-dialog-cancel">
      {confirmState.cancelLabel}
    </Button>
    <Button
      variant={confirmState.destructive ? 'destructive' : 'primary'}
      onclick={_confirm}
      data-testid="confirm-dialog-confirm"
    >
      {confirmState.confirmLabel}
    </Button>
  {/snippet}
</Dialog>
