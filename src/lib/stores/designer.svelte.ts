import type { Block, FlowControl, Page, Question, Questionnaire, Variable } from '$lib/shared';
import { DocumentStore, type DocumentValidationResult } from './designer/DocumentStore';
import {
  UiStore,
  type DesignerLeftTab,
  type DesignerViewMode,
  type DrawerSide,
} from './designer/UiStore';
import { DesignerPersistenceService } from './designer/PersistenceService';
import { generateId } from '$lib/shared/utils/id';

export type SelectedItem = Question | Page | Block | Variable;
export type SelectedItemType = 'question' | 'page' | 'block' | 'variable' | null;

interface CommitOptions {
  selectedItemId?: string | null;
  selectedItemType?: Exclude<SelectedItemType, null>;
  currentPageId?: string | null;
  currentBlockId?: string | null;
  markDirty?: boolean;
  pushHistory?: boolean;
}

class DesignerStore {
  private readonly documentStore = new DocumentStore();
  private readonly uiStore = new UiStore();
  private readonly persistenceService = new DesignerPersistenceService();

  questionnaire = $state<Questionnaire>(this.documentStore.createEmptyQuestionnaire());
  selectedItem = $state<SelectedItem | null>(null);
  selectedItemKind = $state<SelectedItemType>(null);

  // History management
  history = $state<Questionnaire[]>([]);
  historyIndex = $state(-1);

  // Save status
  isDirty = $state(false);
  isLoading = $state(false);
  isPublishing = $state(false);
  lastSaved = $state<number | null>(null);
  saveError = $state<string | null>(null);

  // Navigation state
  currentPageId = $state<string | null>(null);
  currentBlockId = $state<string | null>(null);

  // Metadata state
  userId = $state<string | null>(null);
  projectId = $state<string | null>(null);
  organizationId = $state<string | null>(null);

  // Preview/UI state
  previewMode = $state(false);
  viewMode = $state<DesignerViewMode>('wysiwyg');
  activeLeftTab = $state<DesignerLeftTab>('blocks');
  showCommandPalette = $state(false);
  isLeftDrawerOpen = $state(false);
  isRightDrawerOpen = $state(false);
  leftCollapsed = $state(false);
  rightCollapsed = $state(false);

  constructor() {
    this.syncUiState(this.uiStore.getState());
  }

  get canUndo() {
    return this.historyIndex > 0;
  }

  get canRedo() {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }

  get isSaving() {
    return this.isLoading;
  }

  get currentPage() {
    if (!this.currentPageId) {
      return this.questionnaire.pages[0] || null;
    }
    return this.questionnaire.pages.find((page) => page.id === this.currentPageId) || null;
  }

  get currentPageBlocks() {
    return this.currentPage?.blocks || [];
  }

  get currentBlock() {
    if (!this.currentBlockId) {
      return this.currentPageBlocks[0] || null;
    }
    return this.currentPageBlocks.find((block) => block.id === this.currentBlockId) || null;
  }

  get currentBlockQuestions() {
    const block = this.currentBlock;
    if (!block) return [];
    const ids = new Set(block.questions || []);
    const ordered = (block.questions || [])
      .map((id) => this.questionnaire.questions.find((question) => question.id === id))
      .filter((question): question is Question => Boolean(question));

    if (ordered.length === ids.size) {
      return ordered;
    }

    return this.questionnaire.questions.filter((question) => ids.has(question.id));
  }

  get currentPageQuestions() {
    const ids = new Set<string>();
    for (const block of this.currentPageBlocks) {
      for (const id of block.questions || []) {
        ids.add(id);
      }
    }

    if (ids.size === 0) return [];

    return this.questionnaire.questions.filter((question) => ids.has(question.id));
  }

  get selectedItemType(): SelectedItemType {
    return this.selectedItemKind;
  }

  init(questionnaire: Questionnaire) {
    const normalized = this.documentStore.normalizeQuestionnaire(questionnaire);
    this.questionnaire = normalized;
    this.resetHistory(normalized);
    this.isDirty = false;
    this.saveError = null;
    this.selectedItem = null;
    this.selectedItemKind = null;

    const firstPage = normalized.pages[0] || null;
    this.currentPageId = firstPage?.id || null;
    this.currentBlockId = firstPage?.blocks?.[0]?.id || null;
  }

  initVariableEngine() {
    // Runtime variable engine is initialized in runtime context.
  }

  setUserId(id: string) {
    this.userId = id;
  }

  setOrganizationId(id: string) {
    this.organizationId = id;
  }

  setProjectId(id: string) {
    this.projectId = id;
  }

  setCurrentPage(pageId: string) {
    this.currentPageId = pageId;
    const page = this.questionnaire.pages.find((candidate) => candidate.id === pageId);
    this.currentBlockId = page?.blocks?.[0]?.id || null;
  }

  setCurrentBlock(blockId: string) {
    this.currentBlockId = blockId;
  }

  setViewMode(mode: DesignerViewMode) {
    this.syncUiState(this.uiStore.setViewMode(mode));
  }

  setActiveLeftTab(tab: DesignerLeftTab) {
    this.syncUiState(this.uiStore.setLeftTab(tab));
  }

  togglePreview(force?: boolean) {
    const state = this.uiStore.togglePreview(force);
    this.syncUiState(state);
    this.previewMode = state.showPreview;
  }

  toggleCommandPalette(force?: boolean) {
    this.syncUiState(this.uiStore.toggleCommandPalette(force));
  }

  toggleDrawer(side: DrawerSide, force?: boolean) {
    this.syncUiState(this.uiStore.toggleDrawer(side, force));
  }

  setSidebarCollapsed(side: DrawerSide, collapsed: boolean) {
    this.syncUiState(this.uiStore.setCollapsed(side, collapsed));
    if (typeof localStorage !== 'undefined') {
      this.uiStore.persistCollapsed(localStorage);
    }
  }

  restoreUiFromStorage() {
    if (typeof localStorage === 'undefined') return;
    this.syncUiState(this.uiStore.syncFromStorage(localStorage));
  }

  async createNewQuestionnaire(data: {
    name?: string;
    description?: string;
    projectId?: string;
    organizationId?: string;
  }) {
    if (data.projectId) this.projectId = data.projectId;
    if (data.organizationId) this.organizationId = data.organizationId;

    let createdId = '';
    const draft = this.documentStore.createEmptyQuestionnaire({
      name: data.name,
      description: data.description,
      projectId: this.projectId || data.projectId,
      organizationId: this.organizationId || data.organizationId,
    });

    if (this.projectId) {
      try {
        const persisted = await this.persistenceService.createQuestionnaire(this.projectId, {
          name: draft.name,
          description: draft.description,
          content: {
            ...draft,
            created: draft.created.toISOString(),
            modified: draft.modified.toISOString(),
          },
          settings: draft.settings as Record<string, unknown>,
        });
        createdId = persisted.id;
      } catch (error) {
        this.saveError = error instanceof Error ? error.message : 'Failed to create questionnaire';
      }
    }

    if (createdId) {
      draft.id = createdId;
    }

    this.init(draft);
  }

  loadQuestionnaireFromDefinition(data: any) {
    const normalized = this.documentStore.normalizeQuestionnaire(data);
    this.init(normalized);
  }

  importQuestionnaire(data: any) {
    this.loadQuestionnaireFromDefinition(data);
  }

  updateQuestionnaire(updates: Partial<Questionnaire>) {
    const next = this.documentStore.updateQuestionnaire(this.questionnaire, updates);
    this.commit(next, { markDirty: true });
  }

  addPage() {
    const { questionnaire, pageId } = this.documentStore.addPage(this.questionnaire);
    const blockId = questionnaire.pages.find((page) => page.id === pageId)?.blocks?.[0]?.id || null;
    this.commit(questionnaire, {
      currentPageId: pageId,
      currentBlockId: blockId,
      selectedItemId: pageId,
      selectedItemType: 'page',
      markDirty: true,
    });
  }

  updatePage(id: string, updates: Partial<Page>) {
    const next = this.documentStore.updatePage(this.questionnaire, id, updates);
    this.commit(next, { markDirty: true });
  }

  addBlock(pageId: string, type: Block['type']) {
    const { questionnaire, blockId } = this.documentStore.addBlock(
      this.questionnaire,
      pageId,
      type
    );
    this.commit(questionnaire, {
      currentPageId: pageId,
      currentBlockId: blockId || null,
      selectedItemId: blockId || null,
      selectedItemType: blockId ? 'block' : undefined,
      markDirty: true,
    });
  }

  updateBlock(blockId: string, updates: Partial<Block>) {
    const next = this.documentStore.updateBlock(this.questionnaire, blockId, updates);
    this.commit(next, { markDirty: true });
  }

  deleteBlock(blockId: string) {
    const next = this.documentStore.deleteBlock(this.questionnaire, blockId);
    const currentPage =
      next.pages.find((page) => page.id === this.currentPageId) || next.pages[0] || null;
    const currentBlock = currentPage?.blocks?.[0] || null;
    this.commit(next, {
      currentPageId: currentPage?.id || null,
      currentBlockId: currentBlock?.id || null,
      selectedItemId: null,
      markDirty: true,
    });
  }

  updateBlockQuestions(blockId: string, questionIds: string[]) {
    const next = this.documentStore.updateBlockQuestions(this.questionnaire, blockId, questionIds);
    this.commit(next, { markDirty: true });
  }

  reorderQuestionsInBlock(blockId: string, fromIndex: number, toIndex: number) {
    const next = this.documentStore.reorderQuestionsInBlock(
      this.questionnaire,
      blockId,
      fromIndex,
      toIndex
    );
    this.commit(next, { markDirty: true });
  }

  addQuestion(containerId: string, type: string) {
    const inserted = this.documentStore.addQuestion(this.questionnaire, containerId, type);
    this.commit(inserted.questionnaire, {
      currentPageId: inserted.pageId,
      currentBlockId: inserted.blockId,
      selectedItemId: inserted.questionId,
      selectedItemType: 'question',
      markDirty: true,
    });
  }

  addQuestionToCurrentBlock(type: string = 'text-input') {
    const block = this.currentBlock;
    if (block) {
      this.addQuestion(block.id, type);
      return;
    }

    const page = this.currentPage;
    if (page) {
      this.addQuestion(page.id, type);
    }
  }

  updateQuestion(questionId: string, updates: Partial<Question>) {
    const next = this.documentStore.updateQuestion(this.questionnaire, questionId, updates);
    this.commit(next, {
      selectedItemId: questionId,
      selectedItemType: 'question',
      markDirty: true,
    });
  }

  duplicateQuestion(questionId: string) {
    const duplicated = this.documentStore.duplicateQuestion(this.questionnaire, questionId);
    if (!duplicated) return;

    this.commit(duplicated.questionnaire, {
      currentPageId: duplicated.pageId,
      currentBlockId: duplicated.blockId,
      selectedItemId: duplicated.questionId,
      selectedItemType: 'question',
      markDirty: true,
    });
  }

  deleteQuestion(questionId: string) {
    const next = this.documentStore.deleteQuestion(this.questionnaire, questionId);
    this.commit(next, {
      selectedItemId: null,
      markDirty: true,
    });
  }

  addVariable(variable: Variable) {
    const next = this.documentStore.addVariable(this.questionnaire, variable);
    this.commit(next, {
      selectedItemId: variable.id,
      selectedItemType: 'variable',
      markDirty: true,
    });
  }

  updateVariable(id: string, updates: Partial<Variable>) {
    const next = this.documentStore.updateVariable(this.questionnaire, id, updates);
    this.commit(next, {
      selectedItemId: id,
      selectedItemType: 'variable',
      markDirty: true,
    });
  }

  deleteVariable(id: string) {
    const next = this.documentStore.deleteVariable(this.questionnaire, id);
    this.commit(next, {
      selectedItemId: this.selectedItem?.id === id ? null : this.selectedItem?.id,
      markDirty: true,
    });
  }

  addFlowControl(flow: FlowControl) {
    const next = this.documentStore.addFlowControl(this.questionnaire, flow);
    this.commit(next, { markDirty: true });
  }

  selectItem(itemOrId: string | SelectedItem | null, type?: SelectedItemType) {
    if (!itemOrId) {
      this.selectedItem = null;
      this.selectedItemKind = null;
      return;
    }

    if (typeof itemOrId !== 'string') {
      this.selectedItem = itemOrId;
      this.selectedItemKind = type || this.detectItemType(itemOrId);
      return;
    }

    const question = this.questionnaire.questions.find((candidate) => candidate.id === itemOrId);
    if (question) {
      this.selectedItem = question;
      this.selectedItemKind = type || 'question';
      return;
    }

    const page = this.questionnaire.pages.find((candidate) => candidate.id === itemOrId);
    if (page) {
      this.selectedItem = page;
      this.selectedItemKind = type || 'page';
      return;
    }

    const variable = this.questionnaire.variables.find((candidate) => candidate.id === itemOrId);
    if (variable) {
      this.selectedItem = variable;
      this.selectedItemKind = type || 'variable';
      return;
    }

    for (const currentPage of this.questionnaire.pages) {
      const block = (currentPage.blocks || []).find((candidate) => candidate.id === itemOrId);
      if (block) {
        this.selectedItem = block;
        this.selectedItemKind = type || 'block';
        this.currentPageId = currentPage.id;
        this.currentBlockId = block.id;
        return;
      }
    }

    this.selectedItem = null;
    this.selectedItemKind = null;
  }

  duplicateSelected() {
    if (this.selectedItemKind === 'question' && this.selectedItem) {
      this.duplicateQuestion(this.selectedItem.id);
    }
  }

  moveSelectedQuestion(direction: 'up' | 'down') {
    if (this.selectedItemKind !== 'question' || !this.selectedItem) return;

    const located = this.findBlockContainingQuestion(this.selectedItem.id);
    if (!located) return;

    const fromIndex = located.block.questions.findIndex((id) => id === this.selectedItem?.id);
    if (fromIndex < 0) return;

    const delta = direction === 'up' ? -1 : 1;
    const toIndex = fromIndex + delta;
    if (toIndex < 0 || toIndex >= located.block.questions.length) return;

    this.reorderQuestionsInBlock(located.block.id, fromIndex, toIndex);
    this.selectItem(this.selectedItem.id, 'question');
  }

  deleteSelected() {
    if (!this.selectedItem) return;

    if (this.selectedItemKind === 'question') {
      this.deleteQuestion(this.selectedItem.id);
      return;
    }

    if (this.selectedItemKind === 'block') {
      this.deleteBlock(this.selectedItem.id);
      return;
    }

    if (this.selectedItemKind === 'variable') {
      this.deleteVariable(this.selectedItem.id);
    }
  }

  async saveQuestionnaire(): Promise<boolean> {
    this.isLoading = true;
    this.saveError = null;

    try {
      if (!this.projectId) {
        throw new Error('Missing project ID');
      }

      const result = await this.persistenceService.save({
        projectId: this.projectId,
        questionnaire: this.questionnaire,
      });

      if (!result.success) {
        throw new Error(result.error || 'Save failed');
      }

      if (result.id && !this.questionnaire.id) {
        this.questionnaire.id = result.id;
      }

      this.lastSaved = Date.now();
      this.isDirty = false;
      return true;
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : 'Unknown save error';
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  async publishQuestionnaire(): Promise<boolean> {
    if (!this.projectId || !this.questionnaire.id) {
      this.saveError = 'Cannot publish before questionnaire is saved.';
      return false;
    }

    this.isPublishing = true;

    try {
      const result = await this.persistenceService.publish(this.projectId, this.questionnaire.id);
      if (!result.success) {
        this.saveError = result.error || 'Publish failed';
        return false;
      }

      this.lastSaved = Date.now();
      this.saveError = null;
      return true;
    } finally {
      this.isPublishing = false;
    }
  }

  async listQuestionnaires() {
    if (!this.projectId) return [];
    return this.persistenceService.list(this.projectId);
  }

  async loadQuestionnaire(id: string) {
    if (!this.projectId) return false;

    const loaded = await this.persistenceService.load(this.projectId, id);
    if (!loaded) return false;

    this.init(loaded);
    return true;
  }

  exportQuestionnaire() {
    return this.documentStore.exportQuestionnaire(this.questionnaire);
  }

  validate(): DocumentValidationResult {
    return this.documentStore.validate(this.questionnaire);
  }

  getState() {
    return this.validate();
  }

  undo() {
    if (!this.canUndo) return;

    this.historyIndex -= 1;
    const snapshot = this.history[this.historyIndex];
    if (!snapshot) return;

    this.questionnaire = this.documentStore.normalizeQuestionnaire(snapshot);
    this.isDirty = true;
  }

  redo() {
    if (!this.canRedo) return;

    this.historyIndex += 1;
    const snapshot = this.history[this.historyIndex];
    if (!snapshot) return;

    this.questionnaire = this.documentStore.normalizeQuestionnaire(snapshot);
    this.isDirty = true;
  }

  private commit(next: Questionnaire, options: CommitOptions = {}) {
    this.questionnaire = this.documentStore.normalizeQuestionnaire(next);

    if (options.currentPageId !== undefined) {
      this.currentPageId = options.currentPageId;
    }

    if (options.currentBlockId !== undefined) {
      this.currentBlockId = options.currentBlockId;
    }

    if (options.selectedItemId !== undefined) {
      if (options.selectedItemId) {
        this.selectItem(options.selectedItemId, options.selectedItemType || null);
      } else {
        this.selectedItem = null;
        this.selectedItemKind = null;
      }
    }

    if (options.pushHistory !== false) {
      this.pushHistory(this.questionnaire);
    }

    if (options.markDirty !== false) {
      this.isDirty = true;
    }
  }

  private resetHistory(questionnaire: Questionnaire) {
    const snapshot = this.documentStore.exportQuestionnaire(questionnaire);
    this.history = [snapshot];
    this.historyIndex = 0;
  }

  private pushHistory(questionnaire: Questionnaire) {
    const snapshot = this.documentStore.exportQuestionnaire(questionnaire);

    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(snapshot);
    this.historyIndex = this.history.length - 1;
  }

  private detectItemType(item: SelectedItem): Exclude<SelectedItemType, null> {
    if ('scope' in item) return 'variable';
    if ('blocks' in item) return 'page';
    if ('pageId' in item && 'questions' in item) return 'block';
    return 'question';
  }

  private findBlockContainingQuestion(questionId: string): { page: Page; block: Block } | null {
    for (const page of this.questionnaire.pages) {
      for (const block of page.blocks || []) {
        if ((block.questions || []).includes(questionId)) {
          return { page, block };
        }
      }
    }
    return null;
  }

  private syncUiState(state: ReturnType<UiStore['getState']>) {
    this.viewMode = state.viewMode;
    this.activeLeftTab = state.activeLeftTab;
    this.previewMode = state.showPreview;
    this.showCommandPalette = state.showCommandPalette;
    this.isLeftDrawerOpen = state.isLeftDrawerOpen;
    this.isRightDrawerOpen = state.isRightDrawerOpen;
    this.leftCollapsed = state.leftCollapsed;
    this.rightCollapsed = state.rightCollapsed;
  }
}

export const designerStore = new DesignerStore();
