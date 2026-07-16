import { describe, it, expect } from 'vitest';
import { DesignerStore } from '$lib/stores/designer.svelte';
import { CollaborativeDesigner } from '$lib/collaboration/CollaborativeDesigner';
import type { FlowControl } from '$lib/shared';

/**
 * Two designer-collaboration data-loss bugs, both rooted in content that lived
 * OUTSIDE the Y.Doc CRDT so a remote/synced update overwrote local edits:
 *
 *  (A) A flow-rule edit went through `updateQuestionnaire` → Y.Doc `meta`, but
 *      flow rules are a separate top-level Y.Array that `yDocToQuestionnaire`
 *      reads instead. The edit landed under `meta.flow` (never read) and was
 *      dropped on the next remote reconcile.
 *  (B) A version restore only wrote local store state while the live Y.Doc still
 *      held the old content, so the next remote update clobbered the restore.
 *
 * The wiring below mirrors the designer page: an offline-seeded CollaborativeDesigner
 * whose `onChange` reconciles the store via `applyRemoteUpdate`, attached with
 * `setCollab`. "A remote update arrives" is modelled by re-applying the doc's
 * current questionnaire — exactly what the page does on every sync frame.
 */

interface SeedOptions {
  name?: string;
  questionId?: string;
  flow?: FlowControl[];
}

function seedData(options: SeedOptions = {}) {
  const qid = options.questionId ?? 'qq1';
  return {
    id: 'q-server-1',
    name: options.name ?? 'Study',
    projectId: 'p-1',
    organizationId: 'o-1',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [{ id: qid, type: 'text', title: 'Q', label: 'Q' }],
    pages: [{ id: 'p1', name: 'P', blocks: [{ id: 'b1', name: 'B', questions: [qid] }] }],
    flow: options.flow ?? [],
  };
}

/** Attach a live (offline) collab session wired the way the designer page wires it. */
function attachCollab(store: DesignerStore): CollaborativeDesigner {
  const collab = new CollaborativeDesigner();
  // Offline/local-only seed: fills the Y.Doc from the store's current content.
  collab.init(store.questionnaire);
  collab.onChange((updated) => store.applyRemoteUpdate(updated));
  store.setCollab(collab);
  return collab;
}

describe('collab flow-rule edits survive sync (bug A)', () => {
  it('edits a flow rule through the Y.Doc so a remote update does not revert it', () => {
    const store = new DesignerStore();
    const originalFlow: FlowControl = {
      id: 'flow-1',
      type: 'branch',
      condition: 'age < 18',
      target: 'p1',
    };
    store.loadQuestionnaireFromDefinition(seedData({ flow: [originalFlow] }));
    const collab = attachCollab(store);

    // The author edits the branch condition in the flow UI (FlowControlManager
    // rebuilds the list and calls setFlow).
    store.setFlow([{ ...originalFlow, condition: 'age >= 21' }]);

    // A later remote update re-reconciles the store from the authoritative Y.Doc.
    store.applyRemoteUpdate(collab.getQuestionnaire());

    expect(store.questionnaire.flow).toHaveLength(1);
    expect(store.questionnaire.flow[0]?.condition).toBe('age >= 21');
  });

  it('deletes a flow rule through the Y.Doc so a remote update does not resurrect it', () => {
    const store = new DesignerStore();
    const a: FlowControl = { id: 'flow-a', type: 'skip', condition: 'x == 1', target: 'p1' };
    const b: FlowControl = { id: 'flow-b', type: 'skip', condition: 'x == 2', target: 'p1' };
    store.loadQuestionnaireFromDefinition(seedData({ flow: [a, b] }));
    const collab = attachCollab(store);

    // Remove rule A (the surviving list is what the flow UI hands to setFlow).
    store.setFlow([b]);
    store.applyRemoteUpdate(collab.getQuestionnaire());

    expect(store.questionnaire.flow.map((f) => f.id)).toEqual(['flow-b']);
  });
});

describe('collab version restore survives sync (bug B)', () => {
  it('writes the restored version into the Y.Doc so a remote update does not revert it', () => {
    const store = new DesignerStore();
    // Working copy is v2 (renamed, a different question).
    store.loadQuestionnaireFromDefinition(
      seedData({ name: 'Study v2', questionId: 'q-v2' })
    );
    const collab = attachCollab(store);

    // Restore an older version (same row id) — the historical content blob.
    const oldVersionContent = seedData({ name: 'Study v1', questionId: 'q-v1' });
    store.importQuestionnaire(oldVersionContent);

    // A remote update re-reconciles the store from the Y.Doc. If the restore only
    // touched local state, the doc still holds v2 and this reverts the restore.
    store.applyRemoteUpdate(collab.getQuestionnaire());

    expect(store.questionnaire.name).toBe('Study v1');
    expect(store.questionnaire.questions.map((q) => q.id)).toEqual(['q-v1']);
    // Server-minted identity is preserved across the restore.
    expect(store.questionnaire.id).toBe('q-server-1');
  });
});
