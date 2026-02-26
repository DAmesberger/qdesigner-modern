export type DesignerViewMode = 'structural' | 'wysiwyg';
export type DesignerLeftTab = 'blocks' | 'questions' | 'variables' | 'flow';
export type DrawerSide = 'left' | 'right';

export interface UiState {
  viewMode: DesignerViewMode;
  activeLeftTab: DesignerLeftTab;
  showPreview: boolean;
  showCommandPalette: boolean;
  isLeftDrawerOpen: boolean;
  isRightDrawerOpen: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

export class UiStore {
  private state: UiState;

  constructor() {
    this.state = {
      viewMode: 'wysiwyg',
      activeLeftTab: 'blocks',
      showPreview: false,
      showCommandPalette: false,
      isLeftDrawerOpen: false,
      isRightDrawerOpen: false,
      leftCollapsed: false,
      rightCollapsed: false,
    };
  }

  public getState(): UiState {
    return { ...this.state };
  }

  public setViewMode(viewMode: DesignerViewMode): UiState {
    this.state.viewMode = viewMode;
    return this.getState();
  }

  public setLeftTab(tab: DesignerLeftTab): UiState {
    this.state.activeLeftTab = tab;
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

  public toggleDrawer(side: DrawerSide, force?: boolean): UiState {
    if (side === 'left') {
      this.state.isLeftDrawerOpen = typeof force === 'boolean' ? force : !this.state.isLeftDrawerOpen;
      return this.getState();
    }

    this.state.isRightDrawerOpen = typeof force === 'boolean' ? force : !this.state.isRightDrawerOpen;
    return this.getState();
  }

  public setCollapsed(side: DrawerSide, collapsed: boolean): UiState {
    if (side === 'left') {
      this.state.leftCollapsed = collapsed;
    } else {
      this.state.rightCollapsed = collapsed;
    }

    return this.getState();
  }

  public syncFromStorage(storage: Storage | null): UiState {
    if (!storage) return this.getState();

    this.state.leftCollapsed = storage.getItem('designer-left-sidebar-collapsed') === 'true';
    this.state.rightCollapsed = storage.getItem('designer-right-sidebar-collapsed') === 'true';

    return this.getState();
  }

  public persistCollapsed(storage: Storage | null): void {
    if (!storage) return;
    storage.setItem('designer-left-sidebar-collapsed', String(this.state.leftCollapsed));
    storage.setItem('designer-right-sidebar-collapsed', String(this.state.rightCollapsed));
  }
}
