import { describe, it, expect, vi, beforeEach } from 'vitest';

// F-48: the designer periodic autosave kept POSTing the CREATE endpoint after the
// first successful create — every subsequent tick collided on the
// (project_id, name, version) unique key and 500'd in an endless retry loop.
// These pin the save chokepoint: one create ever, then update-by-id from every
// path; concurrent first-save ticks create exactly once; a same-name conflict
// stops re-POSTing instead of looping.

vi.mock('$lib/services/api', () => ({
  api: {
    questionnaires: {
      get: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('$lib/stores/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { api } from '$lib/services/api';
import { DesignerStore } from '$lib/stores/designer.svelte';

const createMock = api.questionnaires.create as ReturnType<typeof vi.fn>;
const updateMock = api.questionnaires.update as ReturnType<typeof vi.fn>;
const listMock = api.questionnaires.list as ReturnType<typeof vi.fn>;

function freshStore() {
  const store = new DesignerStore();
  store.setUserId('u1');
  store.setProjectId('p1');
  return store;
}

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  listMock.mockReset();
  createMock.mockResolvedValue({ id: 'server-uuid-1', name: 'New Questionnaire' });
  updateMock.mockResolvedValue({ id: 'server-uuid-1', name: 'New Questionnaire' });
  listMock.mockResolvedValue([]);
});

describe('designer save single-flight (F-48)', () => {
  it('after createNewQuestionnaire, every subsequent tick UPDATEs by id (never re-CREATEs)', async () => {
    const store = freshStore();
    await store.createNewQuestionnaire({ name: 'New Questionnaire', projectId: 'p1' });

    expect(store.questionnaire.id).toBe('server-uuid-1');
    expect(createMock).toHaveBeenCalledTimes(1);

    await store.saveQuestionnaire(); // periodic tick #1
    await store.saveQuestionnaire(); // periodic tick #2

    // The create must never fire again; both ticks are updates.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('concurrent first-save ticks (no prior create) create exactly once, then update', async () => {
    const store = freshStore();

    // Three ticks fire before the first create has returned an id.
    await Promise.all([
      store.saveQuestionnaire(),
      store.saveQuestionnaire(),
      store.saveQuestionnaire(),
    ]);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(store.questionnaire.id).toBe('server-uuid-1');
    // The ticks that waited on the single-flight create persist via update.
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('adopts a concurrently-set id: a create that loses the race switches to update', async () => {
    const store = freshStore();
    // First create resolves with an id; the sibling create rejects (server 500
    // duplicate) but by then the id already exists → it must UPDATE, not fail.
    createMock
      .mockResolvedValueOnce({ id: 'server-uuid-1', name: 'New Questionnaire' })
      .mockRejectedValueOnce(new Error('Internal server error'));

    await Promise.all([store.saveQuestionnaire(), store.saveQuestionnaire()]);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(store.questionnaire.id).toBe('server-uuid-1');
  });

  it('a same-name conflict stops retrying create instead of looping forever', async () => {
    const store = freshStore();
    // Server rejects the create (row already exists) and the row shows up in the
    // project listing → the store must block further creates for this name.
    createMock.mockRejectedValue(new Error('Internal server error'));
    listMock.mockResolvedValue([
      { id: 'other-uuid', name: 'New Questionnaire', version: 1, status: 'draft', createdAt: '', updatedAt: '' },
    ]);
    store.updateQuestionnaire({ name: 'New Questionnaire' });

    const first = await store.saveQuestionnaire();
    expect(first).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(1);

    // Subsequent ticks must NOT re-POST the doomed create.
    await store.saveQuestionnaire();
    await store.saveQuestionnaire();
    expect(createMock).toHaveBeenCalledTimes(1);
    // Never adopts+overwrites the existing row.
    expect(updateMock).not.toHaveBeenCalled();

    // Renaming lifts the block: a create for the new name is attempted again.
    listMock.mockResolvedValue([]);
    store.updateQuestionnaire({ name: 'Renamed Questionnaire' });
    await store.saveQuestionnaire();
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('a failed save leaves isDirty set so the pending edit is not silently dropped', async () => {
    const store = freshStore();
    createMock.mockRejectedValue(new Error('network down'));
    store.updateQuestionnaire({ name: 'Work In Progress' });
    expect(store.isDirty).toBe(true);

    const ok = await store.saveQuestionnaire();
    expect(ok).toBe(false);
    // The unsaved work is still flagged dirty (not cleared) so the next tick retries.
    expect(store.isDirty).toBe(true);
  });
});
