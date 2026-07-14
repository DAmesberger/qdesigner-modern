import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The designer's Y.Doc handoff blanked the server-minted questionnaire id, so every
// autosave re-POSTed a create and 409'd, and the author's work was never persisted.
// That bug survived for months for one reason: WHEN THE SAVE FAILED, NOTHING TOLD
// ANYONE. The author pressed Publish and got silence.
//
// These tests pin the silence closed. Every failure exit from the save chokepoint —
// and from create and publish — must reach the author, and must say something true
// about why. The store is the reporter because most callers (the debounce effect,
// beforeNavigate, beforeunload, the autosave tick) are fire-and-forget `void` calls
// that structurally cannot report; beforeunload cannot even await.

vi.mock('$lib/services/api', () => ({
  api: {
    questionnaires: {
      get: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      publish: vi.fn(),
    },
  },
}));

import { api } from '$lib/services/api';
import { ApiError } from '$lib/services/api/errors';
import { DesignerStore } from '$lib/stores/designer.svelte';
import { toast, toasts } from '$lib/stores/toast';
import { get } from 'svelte/store';

const createMock = api.questionnaires.create as ReturnType<typeof vi.fn>;
const updateMock = api.questionnaires.update as ReturnType<typeof vi.fn>;
const listMock = api.questionnaires.list as ReturnType<typeof vi.fn>;
const publishMock = api.questionnaires.publish as ReturnType<typeof vi.fn>;

/** Everything the author would actually see on screen. */
function visibleErrors(): string[] {
  return get(toasts)
    .filter((t) => t.type === 'error')
    .map((t) => `${t.title} ${t.message ?? ''}`.trim());
}

async function savedStore() {
  const store = new DesignerStore();
  store.setUserId('u1');
  store.setProjectId('p1');
  await store.createNewQuestionnaire({ name: 'Study A', projectId: 'p1' });
  return store;
}

beforeEach(() => {
  toast.clearAll();
  createMock.mockReset();
  updateMock.mockReset();
  listMock.mockReset();
  publishMock.mockReset();
  createMock.mockResolvedValue({ id: 'server-uuid-1', name: 'Study A' });
  updateMock.mockResolvedValue({ id: 'server-uuid-1', name: 'Study A' });
  listMock.mockResolvedValue([]);
  publishMock.mockResolvedValue({ id: 'server-uuid-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a failed save is never silent', () => {
  it('a failed UPDATE (the autosave path) tells the author', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('boom', 500));

    const ok = await store.saveQuestionnaire();

    expect(ok).toBe(false);
    // The whole point: the author is not left staring at a document they believe
    // is saved. Something is on screen.
    expect(visibleErrors()).toHaveLength(1);
  });

  it('a failed CREATE tells the author', async () => {
    const store = new DesignerStore();
    store.setUserId('u1');
    store.setProjectId('p1');
    createMock.mockRejectedValue(new ApiError('boom', 500));

    const ok = await store.saveQuestionnaire();

    expect(ok).toBe(false);
    expect(visibleErrors()).toHaveLength(1);
  });

  it('a save with no project id tells the author instead of no-opping', async () => {
    const store = new DesignerStore();
    store.setUserId('u1'); // deliberately no projectId

    const ok = await store.saveQuestionnaire();

    expect(ok).toBe(false);
    expect(visibleErrors()).toHaveLength(1);
    expect(visibleErrors()[0]).toMatch(/project/i);
  });

  it('a failed create-new-questionnaire tells the author before they start typing', async () => {
    const store = new DesignerStore();
    store.setUserId('u1');
    createMock.mockRejectedValue(new ApiError('nope', 500));

    await store.createNewQuestionnaire({ name: 'Study A', projectId: 'p1' });

    expect(store.questionnaire.id).toBeFalsy();
    expect(visibleErrors()).toHaveLength(1);
  });
});

describe('the author is told WHY, in the cases the store can actually distinguish', () => {
  it('offline -> reassures that the work is not lost', async () => {
    const store = await savedStore();
    vi.stubGlobal('navigator', { onLine: false });
    updateMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await store.saveQuestionnaire();

    expect(visibleErrors()[0]).toMatch(/offline/i);
  });

  it('expired session -> tells them to sign in, not "something went wrong"', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('unauthorized', 401));

    await store.saveQuestionnaire();

    expect(visibleErrors()[0]).toMatch(/sign in/i);
  });

  it('409 conflict -> tells them to reload before saving again', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('conflict', 409));

    await store.saveQuestionnaire();

    expect(visibleErrors()[0]).toMatch(/reload/i);
  });

  it('server error -> distinct from all of the above', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('kaboom', 503));

    await store.saveQuestionnaire();

    const shown = visibleErrors()[0];
    expect(shown).toMatch(/server/i);
    expect(shown).not.toMatch(/offline|sign in|reload/i);
  });

  it('an unclassifiable failure shows the server\'s own words rather than inventing a reason', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('content exceeds 1 MB limit', 413));

    await store.saveQuestionnaire();

    expect(visibleErrors()[0]).toContain('content exceeds 1 MB limit');
  });

  it('a taken name -> names the questionnaire and says to rename it', async () => {
    const store = new DesignerStore();
    store.setUserId('u1');
    store.setProjectId('p1');
    store.updateQuestionnaire({ name: 'Study A' });
    createMock.mockRejectedValue(new ApiError('duplicate key', 409));
    listMock.mockResolvedValue([{ id: 'other', name: 'Study A', version: 1, status: 'draft' }]);

    await store.saveQuestionnaire();

    expect(visibleErrors()[0]).toMatch(/Study A/);
    expect(visibleErrors()[0]).toMatch(/rename/i);
  });
});

describe('reporting neither spams nor goes quiet', () => {
  it('the 30s autosave loop re-hitting one failure does not stack a wall of toasts', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('boom', 500));

    await store.saveQuestionnaire();
    await store.saveQuestionnaire();
    await store.saveQuestionnaire();

    // One failure, one toast — it is still on screen (error toasts do not
    // auto-dismiss), so re-showing it would just pile up.
    expect(visibleErrors()).toHaveLength(1);
  });

  it('BUT after the author dismisses it, the next failed save speaks again', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('boom', 500));

    await store.saveQuestionnaire();
    const first = get(toasts).at(0);
    expect(first).toBeDefined();
    toast.remove(first!.id); // the author dismissed it

    await store.saveQuestionnaire(); // they press Save again

    // Deduping on the message alone would leave them with silence here — the
    // exact failure mode this whole change exists to kill.
    expect(visibleErrors()).toHaveLength(1);
  });

  it('a save that recovers stops nagging, and a later failure is reported afresh', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValueOnce(new ApiError('boom', 500));

    await store.saveQuestionnaire();
    expect(visibleErrors()).toHaveLength(1);

    toast.clearAll();
    await store.saveQuestionnaire(); // succeeds
    expect(visibleErrors()).toHaveLength(0);

    updateMock.mockRejectedValueOnce(new ApiError('boom', 500));
    await store.saveQuestionnaire();
    expect(visibleErrors()).toHaveLength(1);
  });
});

describe('publish never proceeds on a failed save — and says why', () => {
  it('publish before any successful save reports instead of silently no-opping', async () => {
    const store = new DesignerStore();
    store.setUserId('u1');
    store.setProjectId('p1'); // no questionnaire.id — the save that should have preceded failed

    const ok = await store.publishQuestionnaire();

    expect(ok).toBe(false);
    expect(publishMock).not.toHaveBeenCalled();
    expect(visibleErrors()).toHaveLength(1);
    expect(visibleErrors()[0]).toMatch(/publish/i);
  });

  it('the Publish button path: save fails -> not published, and the author is told', async () => {
    const store = await savedStore();
    updateMock.mockRejectedValue(new ApiError('boom', 500));

    // Exactly what DesignerHeader/DistributionPanel handlePublish() do.
    const saved = await store.saveQuestionnaire();
    if (saved) await store.publishQuestionnaire();

    expect(saved).toBe(false);
    expect(publishMock).not.toHaveBeenCalled();
    expect(visibleErrors()).toHaveLength(1);
  });

  it('a failed publish itself is reported', async () => {
    const store = await savedStore();
    publishMock.mockRejectedValue(new ApiError('publish blew up', 500));

    const ok = await store.publishQuestionnaire();

    expect(ok).toBe(false);
    expect(visibleErrors()).toHaveLength(1);
  });
});
