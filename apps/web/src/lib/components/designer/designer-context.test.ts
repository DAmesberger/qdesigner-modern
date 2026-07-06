import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Harness from './designer-context-harness.svelte';
import { DesignerStore, designerStore } from '$lib/stores/designer.svelte';

// jsdom lacks the Web Animations API used by some designer subcomponents.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({
      cancel() {},
      finish() {},
      onfinish: null,
      finished: Promise.resolve(),
    });
  }
});

/**
 * F034 acceptance: the Context API seam (setDesignerContext/getDesignerContext)
 * lets a designer component mount against a caller-supplied DesignerStore rather
 * than the module singleton. These tests seed a *fresh* store, inject it through
 * the harness, and assert (1) the component renders from the injected instance
 * and (2) a UI interaction mutates the injected instance while the module
 * singleton stays untouched.
 */
function seedFlow(store: DesignerStore) {
  store.loadQuestionnaireFromDefinition({
    id: 'qn-flow',
    name: 'Flow Seam Test',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [],
    pages: [{ id: 'p1', name: 'Page 1', questions: [] }],
    flow: [{ id: 'flow-abc', type: 'branch', condition: 'x > 1', target: 'p1' }],
  });
}

describe('designer context seam (F034)', () => {
  afterEach(() => cleanup());

  it('renders FlowControlManager from the injected store, not the module singleton', () => {
    const injected = new DesignerStore();
    seedFlow(injected);

    render(Harness, { props: { store: injected } });

    // The seeded flow card only exists in the injected instance's state.
    expect(document.querySelector('[data-testid="flow-card-flow-abc"]')).toBeTruthy();
    // The pristine module singleton has no such flow.
    expect(designerStore.questionnaire.flow?.some((f) => f.id === 'flow-abc')).toBeFalsy();
  });

  it('a delete interaction mutates the injected instance, not the module singleton', async () => {
    const injected = new DesignerStore();
    seedFlow(injected);
    const singletonFlowCountBefore = designerStore.questionnaire.flow?.length ?? 0;

    render(Harness, { props: { store: injected } });

    const deleteBtn = document.querySelector(
      '[aria-label="Delete Flow"]'
    ) as HTMLButtonElement | null;
    expect(deleteBtn).toBeTruthy();

    await fireEvent.click(deleteBtn!);

    // The interaction removed the flow from the INJECTED store...
    expect(injected.questionnaire.flow ?? []).toHaveLength(0);
    // ...and left the module singleton entirely untouched.
    expect(designerStore.questionnaire.flow?.length ?? 0).toBe(singletonFlowCountBefore);
  });
});
