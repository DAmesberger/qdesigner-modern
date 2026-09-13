import { afterEach, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { designerStore } from '$lib/stores/designer.svelte';
import RealtimePreview from './RealtimePreview.svelte';

afterEach(() => {
  cleanup();
  designerStore.loadQuestionnaireFromDefinition({
    id: 'preview-clean',
    name: 'Clean',
    questions: [],
  });
});

it('shows an explicit preview error for executable content without running it', async () => {
  // Simulate unsafe state reaching the preview independently of the guarded loader.
  Object.assign(designerStore.questionnaire.settings, {
    script: 'globalThis.__previewHookExecuted = true',
  });
  const view = render(RealtimePreview, { updateDelay: 0, showDeviceFrame: false });
  await waitFor(() => expect(view.getByText(/UNSAFE_JAVASCRIPT/)).toBeTruthy());
  expect(Reflect.get(globalThis, '__previewHookExecuted')).toBeUndefined();
});
