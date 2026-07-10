import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine } from '$lib/runtime/reaction';
import { TimingGatekeeper } from '$lib/runtime/timing';
import { mediaContentUrl } from '$lib/services/mediaService';
import { computeDerivedReactionMetrics, aggregateReactionProvenance } from '$lib/modules/questions/reaction-time/model/reaction-scoring';
import type { ReactionTaskType } from '$lib/modules/questions/reaction-time/model/reaction-schema';
import {
  compactPhaseTimeline,
  type CompactPhaseMark,
} from '$lib/modules/questions/reaction-time/model/trialRow';
import {
  compileReactionExperimentPlan,
  normalizeReactionExperimentConfig,
} from './model/reaction-experiment';

interface TrialResponse {
  trialId: string;
  trialNumber: number;
  isPractice: boolean;
  taskType: ReactionTaskType;
  blockId: string;
  condition: string | null;
  trialTemplateId: string | null;
  /** Stimulus kind (`shape` | `text` | `image` | `video` | `audio` | `custom`). */
  stimulusKind: string | null;
  key: string | null;
  reactionTime: number | null;
  /** Signed raw reaction time (`response - onset`); may be negative. E-REACT-5. */
  rawRtMs: number | null;
  isCorrect: boolean | null;
  timeout: boolean;
  /** True when a response arrived before onset (a false start occurred). */
  anticipatory: boolean;
  /** Number of discarded pre-onset (anticipatory) responses. */
  falseStartCount: number;
  stimulusOnsetTime: number | null;
  /** Time the stimulus renderable was removed, else null. E-REACT-5. */
  stimulusOffsetTime: number | null;
  expectedResponse: string | null;
  isTarget: boolean | null;
  responseTimingMethod: string | null;
  /** Device family that produced the response (keyboard/mouse/touch/gamepad). */
  responseDevice: string | null;
  /** Key-hold/release paradigms: hold duration in ms, else null. */
  holdDurationMs: number | null;
  /** Gamepad responses: the button index that fired, else null. */
  gamepadButtonIndex: number | null;
  stimulusTimingMethod: string | null;
  /** Visual display-latency compensation applied to the onset (visual only). E-REACT-5. */
  displayLatencyMs: number | null;
  /** Audio output-latency folded into the onset (audio only). E-REACT-5. */
  outputLatencyMs: number | null;
  /** How the stimulus offset was scheduled (E-REACT-3): raf | timeout | none. */
  offsetMethod: string | null;
  /** Measured exposure in frames for a frame-accurate (raf) offset, else null. */
  actualDurationFrames: number | null;
  /** Number of logged video frames (video stimuli only; else 0). E-REACT-5. */
  videoFrameCount: number;
  /** Compacted per-phase timeline for this trial. E-REACT-5. */
  phaseTimeline: CompactPhaseMark[];
  frameStats: {
    fps: number;
    droppedFrames: number;
    jitter: number;
  };
  /** Whether the document was cross-origin isolated during the trial (W-2). */
  crossOriginIsolated: boolean;
  /** Measured `performance.now()` quantum in ms during the trial (W-2). */
  timerResolutionMs: number | null;
  /** Measured display refresh rate in Hz used for drop counting (W-6). */
  measuredRefreshRateHz: number | null;
  /** True when the tab was backgrounded / lost focus during the trial (W-3). */
  visibilityInvalidated: boolean;
  /** True when the trial was invalidated (e.g. stimulus render failed); not a genuine timeout. */
  invalid: boolean;
  invalidReason: string | null;
}

export class ReactionExperimentRuntime implements IQuestionRuntime {
  public readonly type = 'reaction-experiment';

  public readonly capabilities = {
    supportsTiming: true,
    supportsMedia: true,
    supportsVariables: true,
    supportsHighFrequencySampling: true,
  } as const;

  private engine: ReactionEngine | null = null;

  public async prepare(context: QuestionRuntimeContext): Promise<void> {
    this.engine = new ReactionEngine({
      canvas: context.canvas,
      renderer: context.renderer,
      eventTarget: document,
      // Slice 3.4 (CONTRACT-CAL): hand the engine the session-wide gatekeeper.
      // The engine runs qualify() once before the first trial and reads
      // getEstimatedDisplayLatencyMs() to compensate raf-based visual onset.
      gatekeeper: TimingGatekeeper.shared(),
    });

    this.engine.seedFromResourceManager(context.resourceManager);

    // Slice 3.4 (CONTRACT-AUDIO): create + resume the AudioContext now. prepare()
    // runs right before the first trial, under the sticky user activation from
    // the consent / start gesture, so resume() is permitted and audio decode
    // won't stall onset timing mid-trial.
    await this.engine.primeAudio().catch(() => {});
  }

  /**
   * Prime the reaction engine's AudioContext (CONTRACT-AUDIO). Safe to call from
   * a user-gesture handler; no-op if the engine is not constructed yet.
   */
  public async primeAudio(): Promise<void> {
    await this.engine?.primeAudio();
  }

  public async run(context: QuestionRuntimeContext): Promise<QuestionRuntimeResult> {
    if (!this.engine) {
      await this.prepare(context);
    }

    const engine = this.engine;
    if (!engine) {
      throw new Error('ReactionExperimentRuntime failed to initialize');
    }

    const config = normalizeReactionExperimentConfig(context.question);
    const trialPlan = compileReactionExperimentPlan(
      config,
      {
        questionnaire: context.questionnaire,
        question: context.question,
        variableEngine: context.variableEngine,
      },
      {
        // Fillout runtime: load reaction media from the stable same-origin proxy
        // (not the designer-baked, expiring, cross-origin presigned URL) so the
        // WebGL texture isn't tainted and the URL is a durable offline cache key.
        resolveAssetSrc: (asset) =>
          asset.mediaId ? mediaContentUrl(asset.mediaId) : asset.url,
      }
    );

    const stimuli = trialPlan.map((planned) => planned.trial.stimulus).filter(Boolean);
    await engine.warmUpStimuli(stimuli);

    const responses: TrialResponse[] = [];

    for (let index = 0; index < trialPlan.length; index++) {
      const planned = trialPlan[index]!;
      engine.clearScheduledPhases();
      const scheduledPhases = planned.metadata.scheduledPhases || [];
      scheduledPhases.forEach((phase) => engine.schedulePhase(phase));

      const result = await engine.runTrial(planned.trial, context.abortSignal);
      const key =
        result.response && typeof result.response.value === 'string' ? result.response.value : null;

      responses.push({
        trialId: planned.trial.id,
        trialNumber: index + 1,
        isPractice: planned.metadata.isPractice,
        taskType: planned.metadata.taskType,
        blockId: planned.metadata.blockId,
        condition: planned.metadata.condition || null,
        trialTemplateId: planned.metadata.trialTemplateId || null,
        stimulusKind: planned.trial.stimulus?.kind ?? null,
        key,
        reactionTime: result.response?.reactionTimeMs ?? null,
        rawRtMs: result.response?.rawRtMs ?? null,
        isCorrect: result.isCorrect,
        timeout: result.timeout,
        anticipatory: result.anticipatory,
        falseStartCount: result.falseStartCount,
        stimulusOnsetTime: result.stimulusOnsetTime,
        stimulusOffsetTime: result.stimulusOffsetTime,
        expectedResponse: planned.metadata.expectedResponse || null,
        isTarget: planned.metadata.isTarget ?? null,
        responseTimingMethod: result.response?.timingMethod || null,
        responseDevice: result.response?.responseDevice || null,
        holdDurationMs: result.response?.holdDurationMs ?? null,
        gamepadButtonIndex: result.response?.gamepadButtonIndex ?? null,
        stimulusTimingMethod: result.stimulusTimingMethod || null,
        displayLatencyMs: result.displayLatencyMs ?? null,
        outputLatencyMs: result.outputLatencyMs ?? null,
        offsetMethod: result.offsetMethod ?? null,
        actualDurationFrames: result.actualDurationFrames ?? null,
        videoFrameCount: result.videoFrames?.length ?? 0,
        phaseTimeline: compactPhaseTimeline(result.phaseTimeline),
        frameStats: {
          fps: result.stats.fps,
          droppedFrames: result.stats.droppedFrames,
          jitter: result.stats.jitter,
        },
        // Environment / degradation provenance (W-2 / W-3 / W-6, ADR 0027).
        crossOriginIsolated: result.provenance.crossOriginIsolated,
        timerResolutionMs: result.provenance.timerResolutionMs,
        measuredRefreshRateHz: result.provenance.measuredRefreshRateHz ?? null,
        visibilityInvalidated: result.provenance.invalidated === 'visibility',
        invalid: result.invalid ?? false,
        invalidReason: result.invalidReason ?? null,
      });
    }

    const testResponses = responses.filter((response) => !response.isPractice);
    const validRts = testResponses
      .map((response) => response.reactionTime)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    const averageRT =
      validRts.length > 0
        ? validRts.reduce((total, value) => total + value, 0) / validRts.length
        : null;
    const correctness = testResponses.filter((response) => response.isCorrect !== null);
    const accuracy =
      correctness.length > 0
        ? correctness.filter((response) => response.isCorrect).length / correctness.length
        : null;

    return {
      value: {
        responses,
        averageRT,
        accuracy,
        timeouts: testResponses.filter((response) => response.timeout).length,
        derived: computeDerivedReactionMetrics(responses),
      },
      reactionTimeMs: averageRT,
      isCorrect: accuracy !== null ? accuracy >= 0.5 : null,
      timedOut: testResponses.length > 0 ? testResponses.every((response) => response.timeout) : false,
      metadata: {
        template: config.metadata.template,
        trialCount: responses.length,
        assetCount: config.assets.length,
        blockCount: config.blocks.length,
        // C-PROVENANCE aggregate: rolls the per-trial timing methods and frame
        // health up to the response level so `timing_provenance` is populated on
        // the persistence path (per-trial detail stays in `value.responses`).
        timingProvenance: aggregateReactionProvenance(testResponses, averageRT),
      },
    };
  }

  public teardown(): void {
    this.engine?.destroy();
    this.engine = null;
  }
}
