export type DesignerViewMode = 'structural' | 'wysiwyg';
export type DesignerPanel = 'structure' | 'add' | 'templates' | 'variables' | 'flow' | 'help' | null;

const RIGHT_PANEL_PINNED_KEY = 'designer-right-panel-pinned';

/** Read the persisted right-panel pinned flag (false when absent or storage is unavailable). */
export function readRightPanelPinned(storage: Storage | null): boolean {
  return storage?.getItem(RIGHT_PANEL_PINNED_KEY) === 'true';
}

/** Persist the right-panel pinned flag (no-op when storage is unavailable). */
export function persistRightPanelPinned(storage: Storage | null, pinned: boolean): void {
  storage?.setItem(RIGHT_PANEL_PINNED_KEY, String(pinned));
}
