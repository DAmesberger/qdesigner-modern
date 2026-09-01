import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$lib/services/questionnaireDefinitionTransfer', () => ({
  downloadQuestionnaireDefinition: vi.fn(() => Promise.resolve({ digest: 'sha256:test' })),
}));

vi.mock('$lib/stores/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { downloadQuestionnaireDefinition } from '$lib/services/questionnaireDefinitionTransfer';
import { DesignerStore } from '$lib/stores/designer.svelte';
import Harness from './designer-header-harness.svelte';

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom Web Animations polyfill
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({
      cancel() {},
      finish() {},
      onfinish: null,
      finished: Promise.resolve(),
    });
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createStore(): DesignerStore {
  const store = new DesignerStore();
  store.loadQuestionnaireFromDefinition({
    id: 'questionnaire-1',
    projectId: 'project-1',
    name: 'Tracer Questionnaire',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [],
    pages: [{ id: 'page-1', name: 'Page 1', blocks: [] }],
  });
  store.setProjectId('project-1');
  return store;
}

async function openTools() {
  await fireEvent.click(screen.getByTestId('designer-tools-button'));
  return screen.findByTestId('designer-tools-menu');
}

describe('DesignerHeader Questionnaire Definition workflow', () => {
  it('saves dirty authored state before downloading a definition', async () => {
    const store = createStore();
    store.isDirty = true;
    const save = vi.spyOn(store, 'saveQuestionnaire').mockResolvedValue(true);

    render(Harness, { props: { store } });
    await openTools();
    await fireEvent.click(screen.getByText('Export definition (.qdef.json)'));

    await waitFor(() => expect(downloadQuestionnaireDefinition).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(downloadQuestionnaireDefinition).mock.invocationCallOrder[0]!
    );
    expect(downloadQuestionnaireDefinition).toHaveBeenCalledWith('project-1', 'questionnaire-1');
  });

  it('opens dry-run definition inspection from the primary tools menu', async () => {
    const store = createStore();
    render(Harness, { props: { store } });

    await openTools();
    await fireEvent.click(screen.getByText('Inspect definition file'));

    expect(await screen.findByText('Inspect Questionnaire Definition')).toBeTruthy();
    expect(screen.getByText('Dry run only.')).toBeTruthy();
    expect(screen.queryByText('Import now')).toBeNull();
  });
});
