/**
 * Promise-based confirm dialog (F021). Replaces native window.confirm() with a
 * styled, a11y-solid dialog. `confirmDialog(opts)` opens the shared
 * <ConfirmDialogHost /> (mounted once in routes/+layout.svelte) and resolves to
 * a boolean: true on confirm, false on cancel / backdrop / Escape.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (delete/decline flows). */
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

export const confirmState = $state<ConfirmState>({
  open: false,
  title: '',
  message: undefined,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  destructive: false,
  resolve: null,
});

/**
 * Open the global confirm dialog and resolve with the user's choice.
 * Only one dialog is shown at a time; a second call while one is open
 * resolves the earlier one as cancelled before taking over.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // If a prior dialog is somehow still pending, cancel it first.
  if (confirmState.resolve) {
    confirmState.resolve(false);
  }

  confirmState.title = opts.title;
  confirmState.message = opts.message;
  confirmState.confirmLabel = opts.confirmLabel ?? 'Confirm';
  confirmState.cancelLabel = opts.cancelLabel ?? 'Cancel';
  confirmState.destructive = opts.destructive ?? false;
  confirmState.open = true;

  return new Promise<boolean>((resolve) => {
    confirmState.resolve = resolve;
  });
}

function settle(value: boolean) {
  const resolve = confirmState.resolve;
  confirmState.open = false;
  confirmState.resolve = null;
  resolve?.(value);
}

/** Host handler: user pressed the confirm button. */
export function _confirm() {
  settle(true);
}

/** Host handler: user cancelled (button, backdrop, or Escape). */
export function _cancel() {
  settle(false);
}
