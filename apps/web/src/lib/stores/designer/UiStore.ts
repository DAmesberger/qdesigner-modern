export type DesignerViewMode = 'structural' | 'wysiwyg';
export type DesignerPanel = 'structure' | 'add' | 'templates' | 'variables' | 'flow' | 'help' | null;

export interface UiState {
  viewMode: DesignerViewMode;
  activePanel: DesignerPanel;
  showPreview: boolean;
  showCommandPalette: boolean;
  rightPanelPinned: boolean;
}

export class UiStore {
  private state: UiState;

  constructor() {
    this.state = {
      viewMode: 'wysiwyg',
      activePanel: null,
      showPreview: false,
      showCommandPalette: false,
      rightPanelPinned: false,
    };
  }

  public getState(): UiState {
    return { ...this.state };
  }

  public setViewMode(viewMode: DesignerViewMode): UiState {
    this.state.viewMode = viewMode;
    return this.getState();
  }

  public setPanel(panel: DesignerPanel): UiState {
    this.state.activePanel = panel;
    return this.getState();
  }

  public togglePanel(panel: Exclude<DesignerPanel, null>): UiState {
    this.state.activePanel = this.state.activePanel === panel ? null : panel;
    return this.getState();
  }

  public togglePreview(force?: boolean): UiState {
    this.state.showPreview = typeof force === 'boolean' ? force : !this.state.showPreview;
    return this.getState();
  }

  public toggleCommandPalette(force?: boolean): UiState {
    this.state.showCommandPalette = typeof force === 'boolean' ? force : !this.state.showCommandPalette;
    return this.getState();
  }

  public setRightPanelPinned(pinned: boolean): UiState {
    this.state.rightPanelPinned = pinned;
    return this.getState();
  }

  public syncFromStorage(storage: Storage | null): UiState {
    if (!storage) return this.getState();

    const pinned = storage.getItem('designer-right-panel-pinned');
    if (pinned !== null) {
      this.state.rightPanelPinned = pinned === 'true';
    }

    return this.getState();
  }

  public persistToStorage(storage: Storage | null): void {
    if (!storage) return;
    storage.setItem('designer-right-panel-pinned', String(this.state.rightPanelPinned));
  }
}
