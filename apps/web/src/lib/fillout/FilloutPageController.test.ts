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
});
