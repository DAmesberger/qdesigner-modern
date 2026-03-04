/**
 * CollaborativeDesigner — bridge between Y.Doc and the DesignerStore.
 *
 * Responsibilities:
 * - Initializes Y.Doc from current questionnaire state
 * - Observes Y.Doc deep changes and updates the reactive store
 * - Intercepts store mutations and applies them as Yjs transactions
 * - Provides Y.UndoManager-based undo/redo
 * - Falls back to local-only mode when offline
 */

import * as Y from 'yjs';
import { questionnaireToYDoc, yDocToQuestionnaire } from './YjsSchema';
import { YjsProvider, type YjsProviderOptions } from './YjsProvider';
import * as YjsOps from './YjsOperations';
import type {
  Block,
  FlowControl,
  Page,
  Question,
  Questionnaire,
  Variable,
} from '$lib/shared/types/questionnaire';

export interface CollaborativeDesignerOptions {
  questionnaireId: string;
  token: string;
  wsUrl?: string;
}

export class CollaborativeDesigner {
  readonly doc: Y.Doc;
  readonly undoManager: Y.UndoManager;
  private provider: YjsProvider | null = null;
  private observer: (() => void) | null = null;
  private changeCallbacks = new Set<(questionnaire: Questionnaire) => void>();
  private isApplyingRemote = false;

  constructor() {
    this.doc = new Y.Doc();
    // Track undo/redo for all top-level shared types
    this.undoManager = new Y.UndoManager(
      [
        this.doc.getMap('meta'),
        this.doc.getArray('pages'),
        this.doc.getMap('questions'),
        this.doc.getArray('variables'),
        this.doc.getArray('flow'),
      ],
      { captureTimeout: 500 },
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Load a questionnaire into the Y.Doc and optionally connect. */
  init(questionnaire: Questionnaire, options?: CollaborativeDesignerOptions): void {
    questionnaireToYDoc(questionnaire, this.doc);
    this.startObserving();

    if (options) {
      this.connect(options);
    }
  }

  /** Connect to the Yjs WebSocket provider. */
  connect(options: CollaborativeDesignerOptions): void {
    this.disconnect();
    this.provider = new YjsProvider(this.doc, {
      questionnaireId: options.questionnaireId,
      token: options.token,
      wsUrl: options.wsUrl,
    });
    this.provider.connect();
  }

  /** Disconnect from the provider (falls back to local-only mode). */
  disconnect(): void {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
  }

  /** Clean up all resources. */
  destroy(): void {
    this.stopObserving();
    this.disconnect();
    this.undoManager.destroy();
    this.changeCallbacks.clear();
  }

  // -----------------------------------------------------------------------
  // Connection state
  // -----------------------------------------------------------------------

  get connected(): boolean {
    return this.provider?.connected ?? false;
  }

  get synced(): boolean {
    return this.provider?.isSynced ?? false;
  }

  get awareness() {
    return this.provider?.awareness ?? null;
  }

  onConnectionChange(cb: (connected: boolean) => void): () => void {
    if (this.provider) {
      return this.provider.onConnectionChange(cb);
    }
    return () => {};
  }

  // -----------------------------------------------------------------------
  // Change observation
  // -----------------------------------------------------------------------

  /** Register a callback invoked whenever the Y.Doc changes (local or remote). */
  onChange(callback: (questionnaire: Questionnaire) => void): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  /** Get the current questionnaire from the Y.Doc. */
  getQuestionnaire(): Questionnaire {
    return yDocToQuestionnaire(this.doc);
  }

  // -----------------------------------------------------------------------
  // Undo / Redo
  // -----------------------------------------------------------------------

  get canUndo(): boolean {
    return this.undoManager.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.undoManager.redoStack.length > 0;
  }

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }

  // -----------------------------------------------------------------------
  // Operations — these wrap YjsOperations and apply within transactions
  // -----------------------------------------------------------------------

  updateMeta(updates: Record<string, unknown>): void {
    YjsOps.updateMeta(this.doc, updates);
  }

  addPage(name?: string): string {
    return YjsOps.addPage(this.doc, name);
  }

  updatePage(pageId: string, updates: Partial<Page>): void {
    YjsOps.updatePage(this.doc, pageId, updates);
  }

  deletePage(pageId: string): void {
    YjsOps.deletePage(this.doc, pageId);
  }

  addBlock(pageId: string, type?: Block['type'], name?: string): string {
    return YjsOps.addBlock(this.doc, pageId, type, name);
  }

  updateBlock(blockId: string, updates: Partial<Block>): void {
    YjsOps.updateBlock(this.doc, blockId, updates);
  }

  deleteBlock(blockId: string): void {
    YjsOps.deleteBlock(this.doc, blockId);
  }

  addQuestion(blockId: string, question: Question): void {
    YjsOps.addQuestion(this.doc, blockId, question);
  }

  updateQuestion(questionId: string, updates: Partial<Question>): void {
    YjsOps.updateQuestion(this.doc, questionId, updates);
  }

  deleteQuestion(questionId: string): void {
    YjsOps.deleteQuestion(this.doc, questionId);
  }

  reorderQuestionsInBlock(blockId: string, fromIndex: number, toIndex: number): void {
    YjsOps.reorderQuestionsInBlock(this.doc, blockId, fromIndex, toIndex);
  }

  addVariable(variable: Variable): void {
    YjsOps.addVariable(this.doc, variable);
  }

  updateVariable(variableId: string, updates: Partial<Variable>): void {
    YjsOps.updateVariable(this.doc, variableId, updates);
  }

  deleteVariable(variableId: string): void {
    YjsOps.deleteVariable(this.doc, variableId);
  }

  addFlowControl(flow: FlowControl): void {
    YjsOps.addFlowControl(this.doc, flow);
  }

  // -----------------------------------------------------------------------
  // Internal observation
  // -----------------------------------------------------------------------

  private startObserving(): void {
    this.stopObserving();
    const handler = (_update: Uint8Array, origin: unknown) => {
      // Avoid re-entrancy
      if (this.isApplyingRemote) return;
      this.notifyChange();
    };
    this.doc.on('update', handler);
    this.observer = () => this.doc.off('update', handler);
  }

  private stopObserving(): void {
    if (this.observer) {
      this.observer();
      this.observer = null;
    }
  }

  private notifyChange(): void {
    if (this.changeCallbacks.size === 0) return;
    const questionnaire = yDocToQuestionnaire(this.doc);
    for (const cb of this.changeCallbacks) {
      cb(questionnaire);
    }
  }
}
