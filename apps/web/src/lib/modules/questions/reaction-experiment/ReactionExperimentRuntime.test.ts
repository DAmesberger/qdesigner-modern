import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactionStimulusConfig, ReactionTrialResult } from '$lib/runtime/reaction';

// The gate calls the runtime records, asserted below.
const gateCalls: ReactionStimulusConfig[][] = [];

// A hand-built plan the mocked compiler returns; each test overwrites it.
let mockPlan: unknown[] = [];

vi.mock('./model/reaction-experiment', () => ({
  normalizeReactionExperimentConfig: () => ({
    metadata: { template: 'simple-rt' },
    assets: [{ mediaId: 'media-1', kind: 'image' }],
    blocks: [],
    response: {},
    randomization: {},
    stage: {},
    feedback: { enabled: false },
  }),
  compileReactionExperimentPlan: () => mockPlan,
}));

vi.mock('$lib/runtime/timing', () => ({
  TimingGatekeeper: { shared: () => ({}) },
}));

vi.mock('$lib/runtime/reaction', () => ({
  ReactionEngine: class {
    seedFromResourceManager() {}
    async primeAudio() {}
    clearScheduledPhases() {}
    schedulePhase() {}
    async gateBlockMedia(stimuli: ReactionStimulusConfig[]) {
      gateCalls.push(stimuli);
    }
    async runTrial(trial: { id: string }): Promise<ReactionTrialResult> {
      return makeTrialResult(trial.id);
    }
    destroy() {}
  },
  // RT-4: the runtime resolves the session HID manager to arm hardware bindings;
  // the mock has no device so getActiveSource() is null (bindings stay inert).
  HidDeviceManager: { shared: () => ({ getActiveSource: () => null }) },
}));

import { ReactionExperimentRuntime } from './ReactionExperimentRuntime';

/** A minimally-complete ReactionTrialResult so the runtime's scoring path is happy. */
function makeTrialResult(trialId: string): ReactionTrialResult {
  return {
    trialId,
    startedAt: 0,
    stimulusOnsetTime: 100,
    stimulusOnsetRawTime: 100,
    stimulusOffsetTime: null,
    offsetMethod: 'none',
    actualDurationFrames: null,
    stimulusTimingMethod: 'raf',
    displayLatencyMs: undefined,
    outputLatencyMs: undefined,
    anticipatory: false,
    falseStart: false,
    falseStartCount: 0,
    videoFrames: [],
    response: null,
    isCorrect: null,
    timeout: true,
    invalid: false,
    invalidReason: undefined,
    frameLog: [],
    phaseTimeline: [],
    stats: { fps: 120, frameTime: 8, droppedFrames: 0, targetFPS: 120, totalFrames: 1, jitter: 0 },
    provenance: {
      onsetMethod: 'raf',
      responseMethod: null,
      displayLatencyMs: undefined,
      outputLatencyMs: undefined,
      rawRtMs: null,
      anticipatory: false,
      falseStart: false,
      falseStartCount: 0,
      degraded: false,
      offsetMethod: 'none',
      actualDurationFrames: null,
      crossOriginIsolated: true,
      timerResolutionMs: 0.005,
      measuredRefreshRateHz: 60,
      invalidated: null,
      visibilityLossCount: 0,
      visibilityLossPhases: [],
      frameStats: { fps: 120, droppedFrames: 0, jitter: 0 },
    },
  } as ReactionTrialResult;
}

function plannedTrial(opts: {
  blockId: string | null;
  stimulus: ReactionStimulusConfig;
  id: string;
}) {
  return {
    trial: { id: opts.id, stimulus: opts.stimulus },
    metadata: {
      blockId: opts.blockId,
      isPractice: false,
      taskType: 'simple-rt',
      condition: null,
      trialTemplateId: null,
      expectedResponse: null,
      isTarget: null,
      scheduledPhases: [],
    },
  };
}

function makeContext() {
  return {
    question: { id: 'q1', type: 'reaction-experiment' },
    questionnaire: { settings: {} },
    variableEngine: {},
    canvas: document.createElement('canvas'),
    renderer: {},
    resourceManager: {},
    abortSignal: undefined,
    onTrialComplete: vi.fn(),
  } as never;
}

describe('ReactionExperimentRuntime — Layer-2 gate invocation (F-54)', () => {
  beforeEach(() => {
    gateCalls.length = 0;
    mockPlan = [];
  });

  it('gates the FIRST block even when its blockId is null (null !== null skip fix)', async () => {
    const stimulus: ReactionStimulusConfig = {
      kind: 'image',
      src: '/api/media/media-1/content',
      id: 's1',
    };
    // A single block whose blockId is exactly `null` — the value that used to make
    // `blockId !== gatedBlockId` (seeded null) evaluate false and skip the gate.
    mockPlan = [
      plannedTrial({ blockId: null, stimulus, id: 't1' }),
      plannedTrial({ blockId: null, stimulus, id: 't2' }),
    ];

    const runtime = new ReactionExperimentRuntime();
    await runtime.run(makeContext());

    // The gate ran exactly once for the (single, null-id) block…
    expect(gateCalls).toHaveLength(1);
    // …and enumerated the block's image stimulus (mediaId-resolved proxy src).
    expect(gateCalls[0]).toEqual([stimulus, stimulus]);
    runtime.teardown();
  });

  it('gates each distinct block boundary once, enumerating that block’s image trials', async () => {
    const imgA: ReactionStimulusConfig = { kind: 'image', src: '/api/media/a/content', id: 'a' };
    const imgB: ReactionStimulusConfig = { kind: 'image', src: '/api/media/b/content', id: 'b' };
    mockPlan = [
      plannedTrial({ blockId: 'block-1', stimulus: imgA, id: 't1' }),
      plannedTrial({ blockId: 'block-1', stimulus: imgA, id: 't2' }),
      plannedTrial({ blockId: 'block-2', stimulus: imgB, id: 't3' }),
    ];

    const runtime = new ReactionExperimentRuntime();
    await runtime.run(makeContext());

    expect(gateCalls).toHaveLength(2);
    expect(gateCalls[0]).toEqual([imgA, imgA]);
    expect(gateCalls[1]).toEqual([imgB]);
    runtime.teardown();
  });
});
