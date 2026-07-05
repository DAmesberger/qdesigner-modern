import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import PropertiesPanel from './PropertiesPanel.svelte';
import { designerStore } from '$lib/stores/designer.svelte';

// jsdom lacks the Web Animations API used by Svelte transitions in the panel.
beforeAll(async () => {
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
  // Populate the module registry so the panel can resolve a module designer.
  await import('$lib/modules/register-all').then((m) => m.ensureModulesRegistered());
});

/**
 * PropertiesPanel takes NO props: it reads the designerStore singleton (RightSidebar
 * renders `<PropertiesPanel />`). These guardrails (F076) seed the store, select a
 * question, and assert the registry-dispatched module designer mounts and that a
 * title edit propagates through updateQuestion into store state.
 */
function seedTextQuestion() {
  designerStore.loadQuestionnaireFromDefinition({
    id: 'qn-props',
    name: 'Panel Test',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [
      {
        id: 'q_text',
        type: 'text-input',
        name: '',
        display: { prompt: 'Your name?' },
        config: { inputType: 'text', placeholder: 'Enter your response...' },
      },
    ],
  });
  designerStore.selectItem('q_text', 'question');
}

describe('PropertiesPanel', () => {
  beforeEach(() => seedTextQuestion());
  afterEach(() => cleanup());

  it('mounts the registry-dispatched module designer for a text-input question', async () => {
    render(PropertiesPanel);

    // The question-type field is rendered synchronously from store state.
    const typeInput = document.getElementById('question-type-q_text') as HTMLInputElement;
    expect(typeInput).toBeTruthy();
    expect(typeInput.value).toBe('text-input');

    // The module designer (TextInputDesigner) loads asynchronously via
    // moduleRegistry.loadComponent(type, 'designer'); wait for it to settle.
    await waitFor(() => {
      const inputTypeLabel = document.querySelector('label[for="input-type"]');
      expect(inputTypeLabel).toBeTruthy();
    });
  });

  it('propagates an Internal Name edit through updateQuestion into designerStore state', async () => {
    render(PropertiesPanel);

    const nameInput = document.querySelector(
      '[data-testid="designer-question-internal-name"]'
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();

    await fireEvent.input(nameInput, { target: { value: 'demographics_name' } });

    const stored = designerStore.questionnaire.questions.find((q) => q.id === 'q_text');
    expect(stored?.name).toBe('demographics_name');
  });
});
