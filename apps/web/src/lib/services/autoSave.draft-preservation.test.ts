import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readable } from 'svelte/store';

// F-48: a server-side save failure (a duplicate-key 500, a network hiccup) must
// NEVER cost the author their local work. The autosave writes the IndexedDB draft
// BEFORE it attempts the server save, and no failure path deletes a draft.

const { saveDraft, draftsDelete } = vi.hoisted(() => ({
  saveDraft: vi.fn().mockResolvedValue(undefined),
  draftsDelete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./db/indexeddb', () => ({
  db: {
    saveDraft,
    drafts: { delete: draftsDelete },
  },
  ensureDbOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./offline', () => ({
  isOnline: readable(true),
}));

vi.mock('$lib/stores/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('$lib/services/api', () => ({
  api: {
    questionnaires: {
      get: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { api } from '$lib/services/api';
import { autoSave } from './autoSave.svelte';
import { designerStore } from '$lib/stores/designer.svelte';

const updateMock = api.questionnaires.update as ReturnType<typeof vi.fn>;

beforeEach(() => {
  saveDraft.mockClear();
  draftsDelete.mockClear();
  updateMock.mockReset();
});

describe('autosave draft preservation on server failure (F-48)', () => {
  it('reports failure when local draft persistence fails', async () => {
    designerStore.setUserId('u1');
    designerStore.setProjectId('p1');
    designerStore.loadQuestionnaireFromDefinition({
      id: 'q-storage-failure',
      name: 'Study',
      questions: [],
      pages: [],
    });
    saveDraft.mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
    expect(await autoSave.saveNow()).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('hands local storage a cloneable snapshot of a reactive imported question', async () => {
    designerStore.setUserId('u1');
    designerStore.setProjectId('p1');
    designerStore.loadQuestionnaireFromDefinition({
      id: 'q-reactive',
      name: 'Imported form',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      questions: [
        {
          id: 'text',
          type: 'text-input',
          required: true,
          order: 0,
          conditions: { show: 'true' },
          config: { minLength: 5 },
        },
      ],
      pages: [{ id: 'p1', name: 'P', blocks: [{ id: 'b1', name: 'B', questions: ['text'] }] }],
    });
    let captured: unknown;
    // IndexedDB uses the platform structured-clone algorithm. This boundary
    // deliberately rejects reactive proxies, just as the browser does.
    saveDraft.mockImplementationOnce(async (_key, data) => {
      captured = structuredClone(data);
    });
    updateMock.mockRejectedValue(new Error('Network unavailable'));
    expect(await autoSave.saveNow()).toBe(true);
    expect(captured).toMatchObject({
      questions: [
        expect.objectContaining({
          id: 'text',
          conditions: { show: 'true' },
          config: { minLength: 5 },
        }),
      ],
    });
  });

  it('persists the draft and never deletes it when the server save fails', async () => {
    // A persisted questionnaire (has an id) whose server UPDATE fails.
    designerStore.setUserId('u1');
    designerStore.setProjectId('p1');
    designerStore.loadQuestionnaireFromDefinition({
      id: 'q-123',
      name: 'Study',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      questions: [],
      pages: [{ id: 'p1', name: 'P', blocks: [{ id: 'b1', name: 'B', questions: [] }] }],
    });

    updateMock.mockRejectedValue(new Error('Internal server error'));

    // saveNow → performAutoSave: draft first, then the (failing) server save.
    const ok = await autoSave.saveNow();

    // The local draft was written and the server failure did not remove it.
    expect(saveDraft).toHaveBeenCalledWith('q-123', expect.anything(), 'u1', true);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(draftsDelete).not.toHaveBeenCalled();
    // The draft write itself succeeded, so autosave reports success even though
    // the server round-trip failed (work is safe locally).
    expect(ok).toBe(true);
  });
});
