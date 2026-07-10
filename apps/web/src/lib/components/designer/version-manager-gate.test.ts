import { describe, it, expect } from 'vitest';
import { DesignerStore } from '$lib/stores/designer.svelte';

/**
 * R1-6: the header Publish button and the VersionManager "Publish" button both
 * gate on the store's `canPublish` / `publishBlockReason` getters, so an invalid
 * or in-flight document can never be published through either path. These tests
 * pin that shared gate directly on the store (the single source of truth).
 */
function seedValid(store: DesignerStore) {
  store.loadQuestionnaireFromDefinition({
    id: 'q1',
    name: 'Valid Q',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [{ id: 'qq1', type: 'text', title: 'Q', label: 'Q' }],
    pages: [{ id: 'p1', name: 'P', blocks: [{ id: 'b1', name: 'B', questions: ['qq1'] }] }],
  });
}

describe('publish gate (R1-6)', () => {
  it('blocks publish on an empty questionnaire and explains why', () => {
    const store = new DesignerStore();
    store.loadQuestionnaireFromDefinition({
      id: 'q0',
      name: 'Empty',
      questions: [],
      pages: [{ id: 'p1', name: 'P', blocks: [] }],
    });

    expect(store.canPublish).toBe(false);
    expect(store.publishBlockReason).toMatch(/at least one question/i);
  });

  it('blocks publish when validation errors exist', () => {
    const store = new DesignerStore();
    // Duplicate variable names are a validation error that isn't auto-repaired,
    // so the doc has questions yet still can't be published.
    store.loadQuestionnaireFromDefinition({
      id: 'q2',
      name: 'Dup Vars',
      variables: [
        { id: 'v1', name: 'score', type: 'number', scope: 'global' },
        { id: 'v2', name: 'score', type: 'number', scope: 'global' },
      ],
      questions: [{ id: 'qq1', type: 'text', title: 'Q', label: 'Q' }],
      pages: [{ id: 'p1', name: 'P', blocks: [{ id: 'b1', name: 'B', questions: ['qq1'] }] }],
    });

    expect(store.validate().validationErrors.length).toBeGreaterThan(0);
    expect(store.canPublish).toBe(false);
    expect(store.publishBlockReason).toMatch(/validation error/i);
  });

  it('allows publish for a valid questionnaire with at least one question', () => {
    const store = new DesignerStore();
    seedValid(store);

    expect(store.publishBlockReason).toBeNull();
    expect(store.canPublish).toBe(true);
  });

  it('blocks publish while a publish is already in flight', () => {
    const store = new DesignerStore();
    seedValid(store);
    store.isPublishing = true;

    expect(store.canPublish).toBe(false);
    expect(store.publishBlockReason).toMatch(/publishing/i);
  });
});
