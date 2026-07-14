import type { Block, FlowControl, Page, Question, Questionnaire, Variable } from '$lib/shared';
import { defaultTheme, type QuestionnaireTheme } from '$lib/shared';
import {
  getTranslations,
  getBaseLocale,
  getAvailableLocales,
  type LocaleCode,
  type QuestionnaireTranslations,
  type TranslationPath,
} from '$lib/shared';
import { DocumentStore, type DocumentValidationResult } from './designer/DocumentStore';
import type { DesignerPanel, DesignerViewMode } from './designer/ui';
import { readRightPanelPinned, persistRightPanelPinned } from './designer/ui';
import { DesignerPersistenceService } from './designer/PersistenceService';
import { VariableEngine } from '@qdesigner/scripting-engine';
import type { CollaborativeDesigner } from '$lib/collaboration/CollaborativeDesigner';
import { toast } from '$lib/stores/toast';

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

const MAX_HISTORY = 100;

/** Plain deep clone of the translation map (strips any $state proxy). */
function cloneTranslations(
  source: QuestionnaireTranslations | undefined
): QuestionnaireTranslations {
  if (!source) return {};
  try {
    return JSON.parse(JSON.stringify(source)) as QuestionnaireTranslations;
  } catch {
    return {};
  }
}

/**
 * Write one translated string into a plain translations map at `path`, pruning
 * empty leaves so a cleared field never leaves dangling `{}` scaffolding. An
 * empty (whitespace-only) value clears the entry. The locale bundle itself is
 * kept even when empty so a just-added language stays visible in the picker.
 */
function writeTranslationEntry(
  translations: QuestionnaireTranslations,
  locale: LocaleCode,
  path: TranslationPath,
  value: string
): void {
  const keep = value.trim() !== '';
  const bundle = translations[locale] ?? (translations[locale] = {});

  switch (path.kind) {
    case 'question-prompt': {
      const questions = bundle.questions ?? (bundle.questions = {});
      const q = questions[path.questionId] ?? (questions[path.questionId] = {});
      if (keep) q.prompt = value;
      else delete q.prompt;
      if (q.prompt === undefined && (!q.options || Object.keys(q.options).length === 0)) {
        delete questions[path.questionId];
      }
      if (Object.keys(questions).length === 0) delete bundle.questions;
      break;
    }
    case 'question-option': {
      const questions = bundle.questions ?? (bundle.questions = {});
      const q = questions[path.questionId] ?? (questions[path.questionId] = {});
      const options = q.options ?? (q.options = {});
      if (keep) options[path.optionKey] = value;
      else delete options[path.optionKey];
      if (Object.keys(options).length === 0) delete q.options;
      if (q.prompt === undefined && !q.options) delete questions[path.questionId];
      if (Object.keys(questions).length === 0) delete bundle.questions;
      break;
    }
    case 'page-title': {
      const pages = bundle.pages ?? (bundle.pages = {});
      const p = pages[path.pageId] ?? (pages[path.pageId] = {});
      if (keep) p.title = value;
      else delete p.title;
      if (p.title === undefined) delete pages[path.pageId];
      if (Object.keys(pages).length === 0) delete bundle.pages;
      break;
    }
    case 'chrome': {
      const chrome = bundle.chrome ?? (bundle.chrome = {});
      if (keep) chrome[path.slot] = value;
      else delete chrome[path.slot];
      if (Object.keys(chrome).length === 0) delete bundle.chrome;
      break;
    }
  }
}

export class DesignerStore {
  private readonly documentStore = new DocumentStore();
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
  // Last save-failure message we surfaced via a toast. Used to avoid spamming
  // identical error toasts (e.g. a persistent failure re-hit by the 30s
  // autosave loop); cleared on the next successful save.
  private lastSaveErrorToast: string | null = null;
  // F-48: single-flight guard so exactly ONE create is ever dispatched for a
  // questionnaire that has no server id yet. Concurrent/queued autosave ticks
  // (30s interval + 2.5s debounce + Cmd+S + beforeunload) await this instead of
  // each POSTing their own create — every extra create collided on the
  // (project_id, name, version) unique key and 500'd in an endless retry loop.
  private createInFlight: Promise<boolean> | null = null;
  // F-48: once a create has failed because a questionnaire with this name already
  // exists server-side, stop re-POSTing the same create every tick. Keyed by
  // name+version so a rename lifts the block (and never overwrites the existing
  // row's content by "adopting" it).
  private blockedCreateSignature: string | null = null;

  // Navigation state
  currentPageId = $state<string | null>(null);
  currentBlockId = $state<string | null>(null);

  // Metadata state
  userId = $state<string | null>(null);
  projectId = $state<string | null>(null);
  organizationId = $state<string | null>(null);

  // UI state
  previewMode = $state(false);
  viewMode = $state<DesignerViewMode>('wysiwyg');
  activePanel = $state<DesignerPanel>(null);
  showCommandPalette = $state(false);
  rightPanelPinned = $state(false);
  reactionLabQuestionId = $state<string | null>(null);

  // Mobile drawer state
  isLeftDrawerOpen = $state(false);
  isRightDrawerOpen = $state(false);

  // Variable engine
  variableEngine: VariableEngine | null = null;

  // Collaborative editing
  private collab: CollaborativeDesigner | null = null;
  private isApplyingRemote = false;

  constructor() {
    this.rightPanelPinned = readRightPanelPinned(
      typeof localStorage !== 'undefined' ? localStorage : null
    );
  }

  get canUndo() {
    if (this.collab) return this.collab.canUndo;
    return this.historyIndex > 0;
  }

  get canRedo() {
    if (this.collab) return this.collab.canRedo;
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }

  get isSaving() {
    return this.isLoading;
  }

  /**
   * Single source of truth for whether the questionnaire may be published
   * (R1-6). Both publish entry points — the header's Publish button and the
   * VersionManager dropdown — gate on this so an invalid or in-flight document
   * can never be published through either path.
   */
  get canPublish(): boolean {
    return this.publishBlockReason === null;
  }

  /**
   * Human-readable reason the document cannot be published, or `null` when it
   * can. Used as the disabled-button tooltip so the gate explains itself.
   */
  get publishBlockReason(): string | null {
    if (this.isSaving) return 'Saving…';
    if (this.isPublishing) return 'Publishing…';
    if (this.questionnaire.questions.length === 0) {
      return 'Add at least one question before publishing';
    }
    const errorCount = this.validate().validationErrors.length;
    if (errorCount > 0) {
      return `Resolve ${errorCount} validation ${errorCount === 1 ? 'error' : 'errors'} before publishing`;
    }
    return null;
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

  get reactionLabQuestion() {
    if (!this.reactionLabQuestionId) return null;
    return (
      this.questionnaire.questions.find((question) => question.id === this.reactionLabQuestionId) ||
      null
    );
  }

  init(questionnaire: Questionnaire) {
    const normalized = this.documentStore.normalizeQuestionnaire(questionnaire);
    this.questionnaire = normalized;
    this.resetHistory(normalized);
    this.isDirty = false;
    this.saveError = null;
    this.selectedItem = null;
    this.selectedItemKind = null;
    this.reactionLabQuestionId = null;

    const firstPage = normalized.pages[0] || null;
    this.currentPageId = firstPage?.id || null;
    this.currentBlockId = firstPage?.blocks?.[0]?.id || null;
  }

  initVariableEngine() {
    const engine = new VariableEngine();
    for (const v of this.questionnaire.variables) {
      engine.registerVariable(v);
    }
    this.variableEngine = engine;
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

  /** Attach a CollaborativeDesigner instance for live collab. */
  setCollab(collab: CollaborativeDesigner | null) {
    this.collab = collab;
  }

  /** Apply a remote questionnaire update from Yjs without pushing to local history. */
  applyRemoteUpdate(questionnaire: Questionnaire) {
    this.isApplyingRemote = true;
    try {
      const normalized = this.documentStore.normalizeQuestionnaire(questionnaire);

      // The Y.Doc carries collaborative CONTENT; the row id (and the project/org it
      // belongs to) is server-minted identity and is NOT part of the CRDT. A room
      // seeded from a create payload — whose content blob was serialized before the
      // server assigned the id, so it holds id:'' — would otherwise blank the id we
      // just minted. That strands the store on the create path forever: every autosave
      // re-POSTs a create and 409s, Publish silently bails at `if (!saved) return`, and
      // the author's work is never persisted. Identity survives a remote update.
      normalized.id ||= this.questionnaire.id;
      normalized.projectId ||= this.questionnaire.projectId;
      normalized.organizationId ||= this.questionnaire.organizationId;

      this.questionnaire = normalized;

      // Re-resolve selectedItem if present (the object reference changed)
      if (this.selectedItem && this.selectedItemKind) {
        this.selectItem(this.selectedItem.id, this.selectedItemKind);
      }

      this.isDirty = true;
    } finally {
      this.isApplyingRemote = false;
    }
  }

  setViewMode(mode: DesignerViewMode) {
    this.viewMode = mode;
  }

  setPanel(panel: DesignerPanel) {
    this.activePanel = panel;
  }

  togglePanel(panel: Exclude<DesignerPanel, null>) {
    this.activePanel = this.activePanel === panel ? null : panel;
  }

  togglePreview(force?: boolean) {
    this.previewMode = typeof force === 'boolean' ? force : !this.previewMode;
  }

  toggleCommandPalette(force?: boolean) {
    this.showCommandPalette = typeof force === 'boolean' ? force : !this.showCommandPalette;
  }

  toggleDrawer(side: 'left' | 'right', force?: boolean) {
    if (side === 'left') {
      this.isLeftDrawerOpen = typeof force === 'boolean' ? force : !this.isLeftDrawerOpen;
    } else {
      this.isRightDrawerOpen = typeof force === 'boolean' ? force : !this.isRightDrawerOpen;
    }
  }

  setRightPanelPinned(pinned: boolean) {
    this.rightPanelPinned = pinned;
    if (typeof localStorage !== 'undefined') {
      persistRightPanelPinned(localStorage, pinned);
    }
  }

  restoreUiFromStorage() {
    if (typeof localStorage === 'undefined') return;
    this.rightPanelPinned = readRightPanelPinned(localStorage);
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
      // Register this create in the single-flight guard (F-48) so a save tick
      // that fires before init() assigns the id can't dispatch a second,
      // colliding create — it awaits this one and then updates by id.
      const createPromise = (async () => {
        try {
          const persisted = await this.persistenceService.createQuestionnaire(this.projectId!, {
            name: draft.name,
            description: draft.description,
            content: {
              ...draft,
              created: draft.created.toISOString(),
              modified: draft.modified.toISOString(),
            },
            settings: draft.settings as Record<string, unknown>,
          });
          return persisted.id;
        } catch (error) {
          this.saveError = error instanceof Error ? error.message : 'Failed to create questionnaire';
          return '';
        }
      })();
      this.createInFlight = createPromise.then((id) => id !== '');
      try {
        createdId = await createPromise;
      } finally {
        this.createInFlight = null;
      }
    }

    if (createdId) {
      draft.id = createdId;
    }

    this.init(draft);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API/import data with dynamic shape
  loadQuestionnaireFromDefinition(data: any) {
    const normalized = this.documentStore.normalizeQuestionnaire(data);
    this.init(normalized);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw import data with dynamic shape
  importQuestionnaire(data: any) {
    this.loadQuestionnaireFromDefinition(data);
  }

  updateQuestionnaire(updates: Partial<Questionnaire>) {
    if (this.collab) {
      this.collab.updateMeta(updates as Record<string, unknown>);
      return;
    }
    const next = this.documentStore.updateQuestionnaire(this.questionnaire, updates);
    this.commit(next, { markDirty: true });
  }

  /** The questionnaire-level theme (global/page/question style sections). */
  get theme(): QuestionnaireTheme {
    // theme is persisted under settings; the QuestionnaireSettings type does not
    // formally declare it (runtime reads it via cast — see ResourceManager).
    const stored = (this.questionnaire.settings as { theme?: QuestionnaireTheme } | undefined)
      ?.theme;
    return stored ?? defaultTheme;
  }

  /** Apply a single dotted-path edit from the StyleEditor and persist it. */
  updateTheme(path: string[], value: unknown) {
    if (path.length === 0) return;

    const nextTheme = JSON.parse(JSON.stringify(this.theme)) as Record<string, unknown>;
    let cursor: Record<string, unknown> = nextTheme;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (key === undefined) return;
      const child = cursor[key];
      if (child === null || typeof child !== 'object') {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    const lastKey = path[path.length - 1];
    if (lastKey === undefined) return;
    cursor[lastKey] = value;

    this.updateQuestionnaire({
      settings: { ...this.questionnaire.settings, theme: nextTheme } as Questionnaire['settings'],
    });
  }

  // ---------------------------------------------------------------------------
  // Per-locale content translations (MOD-04, ADR 0022)
  //
  // Persisted under settings.translations so edits ride the same settings
  // round-trip as the theme (collaboration meta + JSONB persistence), needing no
  // new endpoint and no schema change.
  // ---------------------------------------------------------------------------

  /** The current per-locale content translation map (empty when none). */
  get contentTranslations(): QuestionnaireTranslations {
    return getTranslations(this.questionnaire) ?? {};
  }

  /** The base authoring locale (from settings.language, default `en`). */
  get baseLocale(): LocaleCode {
    return getBaseLocale(this.questionnaire);
  }

  /** Base locale first, then every locale with a translation bundle. */
  get translationLocales(): LocaleCode[] {
    return getAvailableLocales(this.questionnaire);
  }

  /** Set (or clear, when blank) one translated string and persist. */
  setTranslation(locale: LocaleCode, path: TranslationPath, value: string) {
    const code = locale.trim();
    if (!code || code === this.baseLocale) return;
    const translations = cloneTranslations(getTranslations(this.questionnaire));
    writeTranslationEntry(translations, code, path, value);
    this.persistTranslations(translations);
  }

  /** Add a translation locale so it becomes available for editing / picking. */
  addTranslationLocale(locale: LocaleCode, label?: string) {
    const code = locale.trim();
    if (!code || code === this.baseLocale) return;
    const translations = cloneTranslations(getTranslations(this.questionnaire));
    const bundle = translations[code] ?? (translations[code] = {});
    if (label && label.trim()) bundle.label = label.trim();
    this.persistTranslations(translations);
  }

  /** Remove a translation locale and all its strings. */
  removeTranslationLocale(locale: LocaleCode) {
    const translations = cloneTranslations(getTranslations(this.questionnaire));
    if (!(locale in translations)) return;
    delete translations[locale];
    this.persistTranslations(translations);
  }

  private persistTranslations(translations: QuestionnaireTranslations) {
    this.updateQuestionnaire({
      settings: { ...this.questionnaire.settings, translations } as Questionnaire['settings'],
    });
  }

  addPage() {
    if (this.collab) {
      const pageId = this.collab.addPage();
      // Yjs update fires synchronously → applyRemoteUpdate already ran
      const page = this.questionnaire.pages.find((p) => p.id === pageId);
      this.currentPageId = pageId;
      this.currentBlockId = page?.blocks?.[0]?.id || null;
      this.selectItem(pageId, 'page');
      return;
    }
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
    if (this.collab) {
      this.collab.updatePage(id, updates);
      return;
    }
    const next = this.documentStore.updatePage(this.questionnaire, id, updates);
    this.commit(next, { markDirty: true });
  }

  addBlock(pageId: string, type: Block['type']) {
    if (this.collab) {
      const blockId = this.collab.addBlock(pageId, type);
      this.currentPageId = pageId;
      this.currentBlockId = blockId || null;
      if (blockId) this.selectItem(blockId, 'block');
      return;
    }
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
    if (this.collab) {
      this.collab.updateBlock(blockId, updates);
      return;
    }
    const next = this.documentStore.updateBlock(this.questionnaire, blockId, updates);
    this.commit(next, { markDirty: true });
  }

  deleteBlock(blockId: string) {
    if (this.collab) {
      this.collab.deleteBlock(blockId);
      // Yjs update fires synchronously → applyRemoteUpdate already ran
      const currentPage =
        this.questionnaire.pages.find((p) => p.id === this.currentPageId) ||
        this.questionnaire.pages[0] || null;
      this.currentPageId = currentPage?.id || null;
      this.currentBlockId = currentPage?.blocks?.[0]?.id || null;
      this.selectedItem = null;
      this.selectedItemKind = null;
      return;
    }
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
    if (this.collab) {
      this.collab.updateBlockQuestions(blockId, questionIds);
      return;
    }
    const next = this.documentStore.updateBlockQuestions(this.questionnaire, blockId, questionIds);
    this.commit(next, { markDirty: true });
  }

  reorderQuestionsInBlock(blockId: string, fromIndex: number, toIndex: number) {
    if (this.collab) {
      this.collab.reorderQuestionsInBlock(blockId, fromIndex, toIndex);
      return;
    }
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
    if (this.collab) {
      const question = inserted.questionnaire.questions.find((q) => q.id === inserted.questionId);
      if (question) {
        this.collab.addQuestion(inserted.blockId, question);
      }
      this.currentPageId = inserted.pageId;
      this.currentBlockId = inserted.blockId;
      this.selectItem(inserted.questionId, 'question');
      if (type === 'reaction-experiment') {
        this.openReactionLab(inserted.questionId);
      }
      return;
    }
    this.commit(inserted.questionnaire, {
      currentPageId: inserted.pageId,
      currentBlockId: inserted.blockId,
      selectedItemId: inserted.questionId,
      selectedItemType: 'question',
      markDirty: true,
    });
    if (type === 'reaction-experiment') {
      this.openReactionLab(inserted.questionId);
    }
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
    if (this.collab) {
      this.collab.updateQuestion(questionId, updates);
      return;
    }
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

    if (this.collab) {
      const question = duplicated.questionnaire.questions.find((q) => q.id === duplicated.questionId);
      if (question) {
        this.collab.addQuestion(duplicated.blockId, question);
      }
      this.currentPageId = duplicated.pageId;
      this.currentBlockId = duplicated.blockId;
      this.selectItem(duplicated.questionId, 'question');
      return;
    }

    this.commit(duplicated.questionnaire, {
      currentPageId: duplicated.pageId,
      currentBlockId: duplicated.blockId,
      selectedItemId: duplicated.questionId,
      selectedItemType: 'question',
      markDirty: true,
    });
  }

  deleteQuestion(questionId: string) {
    if (this.reactionLabQuestionId === questionId) {
      this.reactionLabQuestionId = null;
    }
    if (this.collab) {
      this.collab.deleteQuestion(questionId);
      this.selectedItem = null;
      this.selectedItemKind = null;
      return;
    }
    const next = this.documentStore.deleteQuestion(this.questionnaire, questionId);
    this.commit(next, {
      selectedItemId: null,
      markDirty: true,
    });
  }

  addVariable(variable: Variable) {
    if (this.collab) {
      this.collab.addVariable(variable);
      this.selectItem(variable.id, 'variable');
      return;
    }
    const next = this.documentStore.addVariable(this.questionnaire, variable);
    this.commit(next, {
      selectedItemId: variable.id,
      selectedItemType: 'variable',
      markDirty: true,
    });
  }

  updateVariable(id: string, updates: Partial<Variable>) {
    if (this.collab) {
      this.collab.updateVariable(id, updates);
      return;
    }
    const next = this.documentStore.updateVariable(this.questionnaire, id, updates);
    this.commit(next, {
      selectedItemId: id,
      selectedItemType: 'variable',
      markDirty: true,
    });
  }

  deleteVariable(id: string) {
    if (this.collab) {
      this.collab.deleteVariable(id);
      if (this.selectedItem?.id === id) {
        this.selectedItem = null;
        this.selectedItemKind = null;
      }
      return;
    }
    const next = this.documentStore.deleteVariable(this.questionnaire, id);
    this.commit(next, {
      selectedItemId: this.selectedItem?.id === id ? null : this.selectedItem?.id,
      markDirty: true,
    });
  }

  addFlowControl(flow: FlowControl) {
    if (this.collab) {
      this.collab.addFlowControl(flow);
      return;
    }
    const next = this.documentStore.addFlowControl(this.questionnaire, flow);
    this.commit(next, { markDirty: true });
  }

  selectItem(itemOrId: string | SelectedItem | null, type?: SelectedItemType) {
    if (!itemOrId) {
      this.selectedItem = null;
      this.selectedItemKind = null;
      this.reactionLabQuestionId = null;
      return;
    }

    if (typeof itemOrId !== 'string') {
      this.selectedItem = itemOrId;
      this.selectedItemKind = type || this.detectItemType(itemOrId);
      if (this.selectedItemKind !== 'question' || this.selectedItem?.id !== this.reactionLabQuestionId) {
        this.reactionLabQuestionId = null;
      }
      return;
    }

    const question = this.questionnaire.questions.find((candidate) => candidate.id === itemOrId);
    if (question) {
      this.selectedItem = question;
      this.selectedItemKind = type || 'question';
      if (this.reactionLabQuestionId && this.reactionLabQuestionId !== question.id) {
        this.reactionLabQuestionId = null;
      }
      return;
    }

    const page = this.questionnaire.pages.find((candidate) => candidate.id === itemOrId);
    if (page) {
      this.selectedItem = page;
      this.selectedItemKind = type || 'page';
      this.reactionLabQuestionId = null;
      return;
    }

    const variable = this.questionnaire.variables.find((candidate) => candidate.id === itemOrId);
    if (variable) {
      this.selectedItem = variable;
      this.selectedItemKind = type || 'variable';
      this.reactionLabQuestionId = null;
      return;
    }

    for (const currentPage of this.questionnaire.pages) {
      const block = (currentPage.blocks || []).find((candidate) => candidate.id === itemOrId);
      if (block) {
        this.selectedItem = block;
        this.selectedItemKind = type || 'block';
        this.currentPageId = currentPage.id;
        this.currentBlockId = block.id;
        this.reactionLabQuestionId = null;
        return;
      }
    }

    this.selectedItem = null;
    this.selectedItemKind = null;
    this.reactionLabQuestionId = null;
  }

  openReactionLab(questionId: string) {
    this.setPanel(null);
    this.reactionLabQuestionId = questionId;
    this.selectItem(questionId, 'question');
  }

  closeReactionLab() {
    this.reactionLabQuestionId = null;
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

  /**
   * The single chokepoint every save trigger routes through — the autosave
   * interval, the debounced save-on-edit, Cmd+S, in-app navigation and tab-close
   * flushes. It decides create-vs-update once per call and single-flights the
   * create so a questionnaire is only ever POSTed once (F-48).
   */
  async saveQuestionnaire(): Promise<boolean> {
    if (!this.projectId) {
      this.saveError = 'Missing project ID';
      return false;
    }

    // A create is already running for this not-yet-persisted questionnaire: wait
    // for it rather than dispatching a second, colliding create. The winner sets
    // the id; this call then persists the latest content via UPDATE below.
    if (!this.questionnaire.id && this.createInFlight) {
      await this.createInFlight.catch(() => false);
    }

    if (this.questionnaire.id) {
      return this.runUpdate();
    }

    // No id and no create in flight → we own the single-flight create.
    const inFlight = this.runCreate();
    this.createInFlight = inFlight;
    try {
      return await inFlight;
    } finally {
      if (this.createInFlight === inFlight) {
        this.createInFlight = null;
      }
    }
  }

  /** name + semver signature used to block a doomed same-name create (F-48). */
  private createSignature(): string {
    const q = this.questionnaire;
    return `${q.name}|${q.versionMajor}.${q.versionMinor}.${q.versionPatch}`;
  }

  private async runCreate(): Promise<boolean> {
    // A same-name create already failed as a server-side conflict — don't hammer
    // the create endpoint every autosave tick. A rename (new signature) lifts it.
    if (this.blockedCreateSignature === this.createSignature()) {
      return false;
    }

    this.isLoading = true;
    this.saveError = null;
    try {
      const result = await this.persistenceService.save({
        projectId: this.projectId!,
        questionnaire: this.questionnaire,
      });

      if (!result.success) {
        // A sibling create won the race and set the id while we were in flight —
        // adopt it and switch to update instead of re-creating.
        if (this.questionnaire.id) {
          return await this.runUpdate();
        }
        // A row with this name already exists server-side: stop retrying the
        // create (it can only ever 409/500 again) and tell the author how to
        // recover. We deliberately do NOT adopt+overwrite that row — it may be a
        // different questionnaire that merely shares the name.
        if (await this.createConflictExists()) {
          this.blockedCreateSignature = this.createSignature();
          this.saveError = `A questionnaire named “${this.questionnaire.name}” already exists in this project.`;
          this.surfaceSaveError(
            'Rename to save',
            `A questionnaire named “${this.questionnaire.name}” already exists in this project. Rename it to save.`
          );
          return false;
        }
        throw new Error(result.error || 'Save failed');
      }

      if (result.id && !this.questionnaire.id) {
        this.questionnaire.id = result.id;
      }
      this.blockedCreateSignature = null;
      this.lastSaved = Date.now();
      this.isDirty = false;
      this.lastSaveErrorToast = null;
      return true;
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : 'Unknown save error';
      this.surfaceSaveError('Failed to save questionnaire', this.saveError);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  private async runUpdate(): Promise<boolean> {
    this.isLoading = true;
    this.saveError = null;
    try {
      const result = await this.persistenceService.save({
        projectId: this.projectId!,
        questionnaire: this.questionnaire,
      });

      if (!result.success) {
        throw new Error(result.error || 'Save failed');
      }

      this.lastSaved = Date.now();
      this.isDirty = false;
      this.lastSaveErrorToast = null;
      return true;
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : 'Unknown save error';
      this.surfaceSaveError('Failed to save questionnaire', this.saveError);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /** Does a questionnaire with the current name already exist in this project? */
  private async createConflictExists(): Promise<boolean> {
    try {
      const existing = await this.persistenceService.list(this.projectId!);
      return existing.some((item) => item.name === this.questionnaire.name);
    } catch {
      return false;
    }
  }

  /**
   * Surface a save failure via a toast, deduping identical consecutive messages
   * so the autosave loop can't stack a wall of non-dismissing error toasts.
   * Cleared on the next successful save.
   */
  private surfaceSaveError(title: string, message?: string): void {
    const key = message ?? title;
    if (key !== this.lastSaveErrorToast) {
      toast.error(title, message ? { message } : undefined);
      this.lastSaveErrorToast = key;
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
        toast.error(result.error || 'Failed to publish questionnaire');
        return false;
      }

      // Reflect the new published status locally so status-derived UI updates
      // without needing a reload from the server.
      this.questionnaire.metadata = {
        ...(this.questionnaire.metadata ?? {}),
        status: 'published',
      };
      this.lastSaved = Date.now();
      this.saveError = null;
      toast.success('Questionnaire published');
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

  async copyQuestions(questionIds: string[]) {
    const questions = this.questionnaire.questions.filter((q) => questionIds.includes(q.id));
    if (questions.length === 0) return;

    const payload = JSON.stringify({ __qdesigner_clipboard: true, questions });
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // Clipboard API may be unavailable
    }
  }

  async pasteQuestions() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const parsed = JSON.parse(text);
      if (!parsed?.__qdesigner_clipboard || !Array.isArray(parsed.questions)) return;

      const block = this.currentBlock;
      if (!block) return;

      let lastQuestionId: string | null = null;
      for (const q of parsed.questions) {
        const inserted = this.documentStore.addQuestion(this.questionnaire, block.id, q.type);
        const { id: _ignored, ...pastedData } = q;

        if (this.collab) {
          // Merge pasted data onto the DocumentStore-generated question, then send to Yjs
          const baseQuestion = inserted.questionnaire.questions.find(
            (qq) => qq.id === inserted.questionId
          );
          if (baseQuestion) {
            this.collab.addQuestion(block.id, { ...baseQuestion, ...pastedData });
          }
        } else {
          this.questionnaire = this.documentStore.normalizeQuestionnaire(inserted.questionnaire);
          this.questionnaire = this.documentStore.updateQuestion(
            this.questionnaire,
            inserted.questionId,
            pastedData
          );
        }
        lastQuestionId = inserted.questionId;
      }

      if (lastQuestionId) {
        if (this.collab) {
          this.selectItem(lastQuestionId, 'question');
        } else {
          this.commit(this.questionnaire, {
            selectedItemId: lastQuestionId,
            selectedItemType: 'question',
            markDirty: true,
          });
        }
      }
    } catch {
      // Invalid clipboard content or API unavailable
    }
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

    if (this.collab) {
      this.collab.undo();
      return;
    }

    this.historyIndex -= 1;
    const snapshot = this.history[this.historyIndex];
    if (!snapshot) return;

    this.questionnaire = this.documentStore.normalizeQuestionnaire(snapshot);
    this.isDirty = true;
  }

  redo() {
    if (!this.canRedo) return;

    if (this.collab) {
      this.collab.redo();
      return;
    }

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

    if (options.pushHistory !== false && !this.collab) {
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

    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(this.history.length - MAX_HISTORY);
    }

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
}

export const designerStore = new DesignerStore();
