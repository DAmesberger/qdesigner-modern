import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FilloutPageController,
  type FilloutPageData,
  type FilloutServiceBag,
} from './FilloutPageController.svelte';
import type { FilloutDefinition } from '$lib/fillout/types';
import type { ConsentData } from '$lib/fillout/types';
import type { QuestionnaireSession } from '$lib/shared';

// The controller calls the real module-registration promise inside initializeRuntime;
// stub it so the lifecycle runs headlessly without pulling in the module graph.
vi.mock('$lib/modules/register-all', () => ({
  ensureModulesRegistered: () => Promise.resolve(),
}));
// goto is only reached on consent-decline (not exercised here); mock so the import resolves.
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
// WebGL preflight (R2-4). Default to "no WebGL needed" so the existing form-path tests are
// untouched (the probe is never consulted); the preflight tests override per-case.
vi.mock('$lib/fillout/webglPreflight', () => ({
  definitionNeedsWebGL: vi.fn(() => false),
  probeWebGL2Support: vi.fn(() => true),
  isWebGLUnavailableError: vi.fn(() => false),
}));
import {
  definitionNeedsWebGL,
  probeWebGL2Support,
} from '$lib/fillout/webglPreflight';

/**
 * Build a minimal FilloutPageData. `definition` only needs the few fields the controller
 * reads (settings.requireConsent / .quotas / .fraudPrevention, variables), so it is cast.
 */
function makeData(definition: Record<string, unknown> = {}): FilloutPageData {
  return {
    questionnaire: {
      id: 'q1',
      name: 'Test questionnaire',
      definition: {
        questions: [],
        variables: [],
        ...definition,
      } as unknown as FilloutDefinition,
      variables: {},
      globalScripts: {},
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
    },
    existingSession: null,
    code: 'ABC123',
    participantId: null,
    urlParams: {},
    preview: false,
    isOffline: true,
    pinnedFallback: false,
    resumeSnapshot: null,
    resumeCompleted: false,
    resumeFromDevice: false,
    resumeState: undefined,
    resumeStateSessionId: null,
    resumeSessionId: null,
  };
}

function makeMocks() {
  const syncEngine = { start: vi.fn(), stop: vi.fn(), syncNow: vi.fn() };
  const runtime = {
    start: vi.fn(async () => {}),
    dispose: vi.fn(),
    resize: vi.fn(),
    handleKeyPress: vi.fn(),
    setFlowVariable: vi.fn(),
  };
  const gatekeeperInstance = { qualify: vi.fn(async () => ({ grade: 'green' })) };
  const offlineSession = {
    getDeviceInfo: vi.fn(() => ({})),
    createSession: vi.fn(async () => ({ id: 'offline-1', questionnaireId: 'q1' })),
    completeSession: vi.fn(async () => {}),
    clearResumeState: vi.fn(async () => {}),
    recordServerSession: vi.fn(async () => {}),
  };
  const fraud = {
    checkAll: vi.fn(async () => ({ passed: true, flags: [], fingerprint: 'fp', score: 1 })),
    markCompleted: vi.fn(),
  };
  const quota = {
    checkQuotas: vi.fn(async () => ({ allowed: true, fullQuotas: [] })),
    checkCells: vi.fn(async () => ({ allowed: true, cellKey: null, cell: null })),
  };
  const content = {
    pruneDefinitions: vi.fn(async () => {}),
    enforceMediaQuota: vi.fn(async () => {}),
    prepareOffline: vi.fn(async () => ({
      total: 2,
      cached: 2,
      failed: 0,
      ready: true,
      quotaExceeded: false,
    })),
    checkOfflineReadiness: vi.fn(async () => ({
      total: 2,
      cached: 0,
      failed: 0,
      ready: false,
      quotaExceeded: false,
    })),
  };

  const services = {
    offlineSession,
    fraud,
    quota,
    content,
    makeSyncEngine: vi.fn(() => syncEngine),
    makeRuntime: vi.fn(() => runtime),
    gatekeeper: () => gatekeeperInstance,
  };

  return { services, syncEngine, runtime, offlineSession, fraud, quota, content };
}

/** Provide the locale-dependent runtime inputs the view normally supplies. */
function wireRuntimeInputs(controller: FilloutPageController, definition: FilloutDefinition) {
  controller.getRuntimeInputs = () => ({
    canvas: {} as unknown as HTMLCanvasElement,
    definition,
    rawDefinition: definition,
    questionList: [],
    hasReactionQuestion: false,
  });
}

function makeController(
  data: FilloutPageData,
  mocks: ReturnType<typeof makeMocks>
): FilloutPageController {
  return new FilloutPageController(
    data,
    mocks.services as unknown as Partial<FilloutServiceBag>
  );
}

beforeEach(() => {
  // Default the environment to offline so createSessionAndStart takes the local path
  // (no api.sessions.create round-trip). Individual paths under test don't depend on the
  // network otherwise.
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  // Reset the WebGL preflight doubles to their "form-only, supported" defaults.
  vi.mocked(definitionNeedsWebGL).mockReturnValue(false);
  vi.mocked(probeWebGL2Support).mockReturnValue(true);
});

describe('FilloutPageController', () => {
  it('runs start → consent-accept → running with the injected services (no DOM)', async () => {
    const data = makeData({ settings: { requireConsent: true } });
    const mocks = makeMocks();
    const controller = makeController(data, mocks);
    wireRuntimeInputs(controller, data.questionnaire.definition);

    // Welcome "Start" with consent required routes to the consent screen.
    await controller.handleStart();
    expect(controller.screen).toBe('consent');

    // Accepting consent creates the session (offline path) and starts the runtime.
    await controller.handleConsent({} as unknown as ConsentData);

    expect(controller.screen).toBe('runtime');
    expect(mocks.offlineSession.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.services.makeRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.runtime.start).toHaveBeenCalledTimes(1);
    expect(controller.error).toBeNull();
  });

  it('blocks on a full quota and never creates a session', async () => {
    const data = makeData({
      settings: {
        requireConsent: false,
        quotas: [{ id: 'g1', quotas: [] }],
      },
    });
    const mocks = makeMocks();
    mocks.quota.checkQuotas.mockResolvedValueOnce({
      allowed: false,
      message: 'Study full',
      fullQuotas: [],
    } as unknown as Awaited<ReturnType<typeof mocks.quota.checkQuotas>>);

    const controller = makeController(data, mocks);
    wireRuntimeInputs(controller, data.questionnaire.definition);

    await controller.createSessionAndStart();

    expect(controller.screen).toBe('over-quota');
    expect(controller.overQuotaMessage).toBe('Study full');
    expect(mocks.offlineSession.createSession).not.toHaveBeenCalled();
    expect(mocks.services.makeRuntime).not.toHaveBeenCalled();
  });

  it('blocks a reaction study on a failing WebGL probe and never creates a session (R2-4)', async () => {
    const data = makeData({ settings: { requireConsent: false } });
    const mocks = makeMocks();
    // This definition needs WebGL, and the device can't provide it.
    vi.mocked(definitionNeedsWebGL).mockReturnValue(true);
    vi.mocked(probeWebGL2Support).mockReturnValue(false);

    const controller = makeController(data, mocks);
    wireRuntimeInputs(controller, data.questionnaire.definition);

    await controller.handleStart();

    expect(controller.screen).toBe('webgl-unsupported');
    expect(probeWebGL2Support).toHaveBeenCalledTimes(1);
    expect(mocks.offlineSession.createSession).not.toHaveBeenCalled();
    expect(mocks.services.makeRuntime).not.toHaveBeenCalled();
  });

  it('does not consult the WebGL probe for a form-only definition (R2-4)', async () => {
    const data = makeData({ settings: { requireConsent: false } });
    const mocks = makeMocks();
    // Default: definitionNeedsWebGL → false.
    const controller = makeController(data, mocks);
    wireRuntimeInputs(controller, data.questionnaire.definition);

    await controller.handleStart();

    // No block, probe never consulted, and the normal start flow ran.
    expect(controller.screen).toBe('runtime');
    expect(probeWebGL2Support).not.toHaveBeenCalled();
    expect(mocks.offlineSession.createSession).toHaveBeenCalledTimes(1);
  });

  it('completes: marks the offline session complete, then syncs, then shows completion', async () => {
    const data = makeData();
    const mocks = makeMocks();
    const controller = makeController(data, mocks);

    // The sync engine must exist for handleComplete to trigger a sync.
    controller.startSyncEngine();
    expect(mocks.syncEngine.start).toHaveBeenCalledTimes(1);

    // Simulate a started session.
    controller.session = { id: 'sess-42', questionnaire_id: 'q1', status: 'active' };

    const completed = {
      id: 'sess-42',
      variables: [],
    } as unknown as QuestionnaireSession;

    await controller.handleComplete(completed);

    expect(mocks.offlineSession.completeSession).toHaveBeenCalledWith('sess-42');
    expect(mocks.syncEngine.syncNow).toHaveBeenCalledTimes(1);
    // completeSession is awaited BEFORE syncNow fires.
    expect(mocks.offlineSession.completeSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.syncEngine.syncNow.mock.invocationCallOrder[0]!
    );
    expect(mocks.fraud.markCompleted).toHaveBeenCalledWith('q1');
    expect(controller.screen).toBe('complete');
    // `$state` deep-proxies the assigned object, so compare by value, not identity.
    expect(controller.completedSession).toEqual(completed);
  });

  it('routes an eligibility screen-out to the screened-out screen, not completion (F-20)', async () => {
    const data = makeData();
    const mocks = makeMocks();
    const controller = makeController(data, mocks);
    controller.startSyncEngine();
    controller.session = { id: 'sess-so', questionnaire_id: 'q1', status: 'active' };

    // The runtime stamps metadata.screenOut when a screen-out terminate/screener rule fires.
    const completed = {
      id: 'sess-so',
      variables: [],
      metadata: {
        screenOut: {
          reason: 'ineligible',
          ruleId: 'f-screenout',
          message: 'You do not qualify for this study.',
          redirectUrl: 'https://panel.example.com/screenout',
          at: new Date().toISOString(),
        },
      },
    } as unknown as QuestionnaireSession;

    await controller.handleComplete(completed);

    expect(controller.screen).toBe('screened-out');
    expect(controller.screenOut).toEqual({
      eligible: false,
      ruleId: 'f-screenout',
      reason: 'ineligible',
      message: 'You do not qualify for this study.',
      redirectUrl: 'https://panel.example.com/screenout',
    });
    // Still a terminal session locally, but never a normal completion screen.
    expect(mocks.offlineSession.completeSession).toHaveBeenCalledWith('sess-so');
    expect(controller.completedSession).toEqual(completed);
  });

  it('routes a natural completion (no screenOut metadata) to the completion screen (F-20)', async () => {
    const data = makeData();
    const mocks = makeMocks();
    const controller = makeController(data, mocks);
    controller.startSyncEngine();
    controller.session = { id: 'sess-done', questionnaire_id: 'q1', status: 'active' };

    const completed = {
      id: 'sess-done',
      variables: [],
      metadata: { qualityReport: {} },
    } as unknown as QuestionnaireSession;

    await controller.handleComplete(completed);

    expect(controller.screen).toBe('complete');
    expect(controller.screenOut).toBeNull();
  });

  describe('recoverable media-preload failure (R2-5)', () => {
    it('routes a preload failure to the media-error screen with the failed count', async () => {
      const data = makeData({ settings: { requireConsent: false } });
      const mocks = makeMocks();
      // runtime.start throws the ResourceManager preload error on the first attempt.
      mocks.runtime.start.mockRejectedValueOnce(
        new Error('Failed to preload 2 resources:\n- image "a" (x): boom\n- audio "b" (y): boom')
      );

      const controller = makeController(data, mocks);
      wireRuntimeInputs(controller, data.questionnaire.definition);

      await controller.createSessionAndStart();

      // A recoverable screen — not the generic dead-end error.
      expect(controller.screen).toBe('media-error');
      expect(controller.error).toBeNull();
      expect(controller.mediaErrorCount).toBe(2);
      expect(controller.mediaErrorDetails).toContain('Failed to preload');
      // The session was created exactly once and is preserved for the retry.
      expect(mocks.offlineSession.createSession).toHaveBeenCalledTimes(1);
      expect(controller.session?.id).toBe('offline-1');
    });

    it('retry re-runs the preload against the same session without a duplicate', async () => {
      const data = makeData({ settings: { requireConsent: false } });
      const mocks = makeMocks();
      // Fail once, then succeed on the retry.
      mocks.runtime.start.mockRejectedValueOnce(
        new Error('Failed to preload 1 resource:\n- image "a" (x): boom')
      );

      const controller = makeController(data, mocks);
      wireRuntimeInputs(controller, data.questionnaire.definition);

      await controller.createSessionAndStart();
      expect(controller.screen).toBe('media-error');

      await controller.retryMediaPreload();

      // Retry rebuilt the runtime and re-ran start — the preload re-attempt.
      expect(controller.screen).toBe('runtime');
      expect(controller.error).toBeNull();
      expect(controller.mediaErrorDetails).toBeNull();
      expect(mocks.services.makeRuntime).toHaveBeenCalledTimes(2);
      expect(mocks.runtime.start).toHaveBeenCalledTimes(2);
      // The stale runtime from the failed attempt is disposed before the rebuild.
      expect(mocks.runtime.dispose).toHaveBeenCalledTimes(1);
      // No second session was created — the same offline session is reused.
      expect(mocks.offlineSession.createSession).toHaveBeenCalledTimes(1);
      expect(controller.session?.id).toBe('offline-1');
    });
  });

  describe('participant progress (F-7)', () => {
    it('reports current page of total pages for a linear flow', () => {
      const data = makeData({ pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] });
      const controller = makeController(data, makeMocks());

      expect(controller.progress).toBeNull();

      controller.recordItemProgress({ pageIndex: 0 });
      expect(controller.progress).toEqual({ current: 1, total: 3 });

      controller.recordItemProgress({ pageIndex: 1 });
      expect(controller.progress).toEqual({ current: 2, total: 3 });
    });

    it('is monotonic: back-navigation / loop revisit never regresses the bar', () => {
      const data = makeData({ pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] });
      const controller = makeController(data, makeMocks());

      controller.recordItemProgress({ pageIndex: 2 });
      expect(controller.progress).toEqual({ current: 3, total: 3 });

      // Revisiting an earlier page keeps the furthest-reached ordinal.
      controller.recordItemProgress({ pageIndex: 0 });
      expect(controller.progress).toEqual({ current: 3, total: 3 });
    });

    it('reports an indeterminate total for a flow with a loop rule', () => {
      const data = makeData({
        pages: [{ id: 'p1' }, { id: 'p2' }],
        flow: [{ id: 'f1', type: 'loop' }],
      });
      const controller = makeController(data, makeMocks());

      controller.recordItemProgress({ pageIndex: 0 });
      expect(controller.progress).toEqual({ current: 1, total: null });
    });

    it('reports an indeterminate total for a definition with an adaptive block', () => {
      const data = makeData({
        pages: [{ id: 'p1', blocks: [{ id: 'b1', type: 'adaptive' }] }, { id: 'p2' }],
      });
      const controller = makeController(data, makeMocks());

      controller.recordItemProgress({ pageIndex: 0 });
      expect(controller.progress).toEqual({ current: 1, total: null });
    });
  });

  describe('honest cross-device resume fallback (F-10)', () => {
    it('seeds the notice from the load flag and clears it on dismiss', () => {
      const data = { ...makeData(), crossDeviceResumeUnavailable: true };
      const controller = makeController(data, makeMocks());

      expect(controller.crossDeviceNotice).toBe(true);
      controller.dismissCrossDeviceNotice();
      expect(controller.crossDeviceNotice).toBe(false);
    });

    it('does not show the notice for a normal (non cross-device) open', () => {
      const controller = makeController(makeData(), makeMocks());
      expect(controller.crossDeviceNotice).toBe(false);
    });
  });

  describe('explicit offline provisioning (F-21)', () => {
    it('prepareOffline delegates to the content cache and confirms ready', async () => {
      const data = makeData();
      const mocks = makeMocks();
      const controller = makeController(data, mocks);

      await controller.prepareOffline();

      expect(mocks.content.prepareOffline).toHaveBeenCalledTimes(1);
      const call = mocks.content.prepareOffline.mock.calls[0] as unknown as [
        string,
        { major: number; minor: number; patch: number },
        Record<string, unknown>,
      ];
      expect(call[0]).toBe('q1');
      expect(call[1]).toEqual({ major: 1, minor: 0, patch: 0 });
      expect(call[2]).toBe(data.questionnaire.definition);
      expect(controller.offlinePrep).toBe('ready');
      expect(controller.offlinePrepDone).toBe(2);
      expect(controller.offlinePrepTotal).toBe(2);
    });

    it('surfaces a partial result honestly', async () => {
      const mocks = makeMocks();
      mocks.content.prepareOffline.mockResolvedValueOnce({
        total: 3,
        cached: 2,
        failed: 1,
        ready: false,
        quotaExceeded: false,
      });
      const controller = makeController(makeData(), mocks);

      await controller.prepareOffline();

      expect(controller.offlinePrep).toBe('partial');
      expect(controller.offlinePrepDone).toBe(2);
      expect(controller.offlinePrepTotal).toBe(3);
    });

    it('surfaces an over-quota result honestly', async () => {
      const mocks = makeMocks();
      mocks.content.prepareOffline.mockResolvedValueOnce({
        total: 4,
        cached: 4,
        failed: 0,
        ready: true,
        quotaExceeded: true,
      });
      const controller = makeController(makeData(), mocks);

      await controller.prepareOffline();

      expect(controller.offlinePrep).toBe('quota-exceeded');
    });

    it('falls back to an error state when preparation throws', async () => {
      const mocks = makeMocks();
      mocks.content.prepareOffline.mockRejectedValueOnce(new Error('network down'));
      const controller = makeController(makeData(), mocks);

      await controller.prepareOffline();

      expect(controller.offlinePrep).toBe('error');
    });

    it('refreshOfflineReadiness reflects an already-cached study as ready', async () => {
      const mocks = makeMocks();
      mocks.content.checkOfflineReadiness.mockResolvedValueOnce({
        total: 2,
        cached: 2,
        failed: 0,
        ready: true,
        quotaExceeded: false,
      });
      const controller = makeController(makeData(), mocks);

      await controller.refreshOfflineReadiness();

      expect(controller.offlinePrep).toBe('ready');
      expect(controller.offlinePrepDone).toBe(2);
      expect(controller.offlinePrepTotal).toBe(2);
    });
  });
});
