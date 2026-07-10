import { describe, it, expect } from 'vitest';
import { DesignerStore } from '$lib/stores/designer.svelte';

/**
 * R4-5: the header's undo/redo buttons reflect `canUndo` / `canRedo` in their
 * disabled state. These pin that store contract (the single source of truth the
 * buttons read) across the init → edit → undo → redo cycle.
 */
function seed(store: DesignerStore) {
  store.loadQuestionnaireFromDefinition({
    id: 'q1',
    name: 'Q',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [{ id: 'qq1', type: 'text', title: 'Q', label: 'Q' }],
    pages: [{ id: 'p1', name: 'P', blocks: [{ id: 'b1', name: 'B', questions: ['qq1'] }] }],
  });
}

describe('undo/redo disabled-state (R4-5)', () => {
  it('has nothing to undo or redo right after load', () => {
    const store = new DesignerStore();
    seed(store);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it('enables undo after an edit, and redo only after undoing', () => {
    const store = new DesignerStore();
    seed(store);

    store.updateQuestionnaire({ name: 'Renamed' });
    expect(store.canUndo).toBe(true);
    expect(store.canRedo).toBe(false);

    store.undo();
    expect(store.questionnaire.name).toBe('Q');
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);

    store.redo();
    expect(store.questionnaire.name).toBe('Renamed');
    expect(store.canUndo).toBe(true);
    expect(store.canRedo).toBe(false);
  });

  it('undo/redo are no-ops (and stay guarded) at the stack ends', () => {
    const store = new DesignerStore();
    seed(store);

    // Nothing to undo yet — calling undo must not move history or throw.
    store.undo();
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);

    store.updateQuestionnaire({ name: 'Once' });
    store.redo(); // nothing ahead
    expect(store.canRedo).toBe(false);
    expect(store.canUndo).toBe(true);
  });
});
