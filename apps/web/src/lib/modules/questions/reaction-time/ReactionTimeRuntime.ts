import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine, assignCounterbalance } from '$lib/runtime/reaction';
import type { Binding } from '$lib/runtime/reaction';
import { TimingGatekeeper } from '$lib/runtime/timing';
import { mediaContentUrl } from '$lib/services/mediaService';
import { compileReactionPlan } from './model/reaction-compiler';
import type { PlannedReactionTrial } from './model/reaction-plan-types';
import { normalizeReactionQuestionConfig } from './model/reaction-normalize';
import { computeDerivedReactionMetrics, aggregateReactionProvenance } from './model/reaction-scoring';
import type { ReactionTaskType } from './model/reaction-schema';
import { compactPhaseTimeline, type CompactPhaseMark } from './model/trialRow';

/**
 * Recursively rewrite every media reference in a freshly-normalized (mutable)
 * reaction config to the stable same-origin proxy URL derived from its mediaId.
 * A mediaRef is any object carrying both a `mediaId` string and a `mediaUrl`
 * field; this covers top-level, per-block, and per-trial stimulus references
 * generically without threading a resolver through the whole compiler.
 */
function resolveConfigMediaToProxy(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) resolveConfigMediaToProxy(item);
    return;
  }
  const record = value as Record<string, unknown>;
  const mediaId = record.mediaId;
  if (typeof mediaId === 'string' && mediaId.length > 0 && 'mediaUrl' in record) {
    record.mediaUrl = mediaContentUrl(mediaId);
  }
  for (const v of Object.values(record)) {
    if (v && typeof v === 'object') resolveConfigMediaToProxy(v);
  }
}

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
  /** ResponseSet (ADR 0024): the winning ResponseOption id, else null. */
  optionId: string | null;
  /** ResponseSet (ADR 0024): the winning source family (keyboard/pointer/…), else null. */
  responseSource: string | null;
  /** ResponseSet (ADR 0024): the concrete winning binding (key/button/edge), else null. */
  binding: Binding | null;
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
  /** The participant's assigned counterbalance cell (E-REACT-6), or null when none. */
  counterbalanceCell: string | null;
}

export class ReactionTimeRuntime implements IQuestionRuntime {
  public readonly type = 'reaction-time';

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
      throw new Error('ReactionTimeRuntime failed to initialize reaction engine');
    }

    const config = normalizeReactionQuestionConfig(context.question);
    // Fillout runtime: rewrite every baked media reference to the stable
    // same-origin proxy path from its mediaId, so the WebGL stimulus isn't loaded
    // from a cross-origin / expiring presigned URL (taints the texture and breaks
    // the offline cache key). Designer preview keeps the baked presigned URL.
    resolveConfigMediaToProxy(config);

    // E-REACT-6: resolve the participant's counterbalance cell ONCE, so the same
    // cell drives the compiled plan and is persisted for reproducibility + export.
    const baseSeed =
      context.questionnaire?.settings?.randomizationSeed ||
      context.question?.id ||
      'reaction-time';
    const counterbalance = assignCounterbalance(config.counterbalance, {
      seed: baseSeed,
      sessionId: context.sessionId,
      participantIndex: context.participantNumber,
    });
    const counterbalanceCell = counterbalance.cellKey || null;

    const trialPlan = compileReactionPlan(config, {
      questionnaire: context.questionnaire,
      question: context.question,
      sessionId: context.sessionId,
      participantIndex: context.participantNumber,
      counterbalance,
    });

    const blockStimuli = trialPlan.map((planned) => planned.trial.stimulus).filter(Boolean);
    await engine.warmUpStimuli(blockStimuli);

    const allResponses: TrialResponse[] = [];
    // E-REACT-4: how many practice passes each criterion-gated block actually
    // took, surfaced in metadata for the researcher.
    const practiceAttempts: Record<string, number> = {};
    // Monotonic across every executed trial (including repeated practice passes)
    // so each persisted response keeps a unique, ordered trial number.
    let trialNumber = 0;

    const runGroup = async (group: PlannedReactionTrial[]): Promise<TrialResponse[]> => {
      const groupResponses: TrialResponse[] = [];
      for (const planned of group) {
        trialNumber += 1;
        groupResponses.push(
          await this.runPlannedTrial(engine, planned, trialNumber, context, counterbalanceCell)
        );
      }
      return groupResponses;
    };

    for (const group of groupIntoBlockRuns(trialPlan)) {
      const criterion = group[0]?.metadata.practiceCriterion;
      const isPracticeGroup = group.every((planned) => planned.metadata.isPractice);

      if (criterion && isPracticeGroup) {
        // Criterion-based practice (E-REACT-4): re-run the practice block until
        // the participant's accuracy reaches the target or the attempt budget is
        // spent, then advance to the test. Every attempt's trials are persisted;
        // only test trials feed the scored averages downstream.
        const maxAttempts = Math.max(1, criterion.maxAttempts);
        const blockId = group[0]?.metadata.blockId ?? 'practice';
        let attempts = 0;

        while (attempts < maxAttempts) {
          attempts += 1;
          const attemptResponses = await runGroup(group);
          allResponses.push(...attemptResponses);
          if (practiceAccuracy(attemptResponses) >= criterion.minAccuracy) {
            break;
          }
        }

        practiceAttempts[blockId] = attempts;
        continue;
      }

      allResponses.push(...(await runGroup(group)));
    }

    const testResponses = allResponses.filter((response) => !response.isPractice);
    const validRTs = testResponses
      .map((response) => response.reactionTime)
      .filter((value): value is number => typeof value === 'number' && value > 0);

    const averageRT =
      validRTs.length > 0
        ? validRTs.reduce((total, value) => total + value, 0) / validRTs.length
        : null;

    const correctnessResponses = testResponses.filter((response) => response.isCorrect !== null);
    const accuracy =
      correctnessResponses.length > 0
        ? correctnessResponses.filter((response) => response.isCorrect).length /
          correctnessResponses.length
        : null;

    const byCondition = summarizeByDimension(testResponses, (response) => response.condition || 'unlabeled');
    const byBlock = summarizeByDimension(testResponses, (response) => response.blockId || 'default');
    const derived = computeDerivedReactionMetrics(allResponses);

    return {
      value: {
        responses: allResponses,
        averageRT,
        accuracy,
        timeouts: testResponses.filter((response) => response.timeout).length,
        byCondition,
        byBlock,
        derived,
      },
      reactionTimeMs: averageRT,
      isCorrect: accuracy !== null ? accuracy >= 0.5 : null,
      timedOut: testResponses.length > 0 ? testResponses.every((response) => response.timeout) : false,
      metadata: {
        trialCount: allResponses.length,
        practiceTrials: allResponses.filter((response) => response.isPractice).length,
        testTrials: testResponses.length,
        taskType: config.task.type,
        blockCount: new Set(allResponses.map((response) => response.blockId)).size,
        // E-REACT-4: practice passes taken per criterion-gated block.
        practiceAttempts,
        // E-REACT-6: the participant's assigned counterbalance cell, persisted so
        // the block/key/subset assignment is reproducible and exports as a column.
        counterbalanceCell,
        counterbalance: counterbalance.cell,
        // C-PROVENANCE: roll per-trial timing up so reaction-time responses persist a
        // non-empty timing_provenance (parity with reaction-experiment).
        timingProvenance: aggregateReactionProvenance(testResponses, averageRT),
      },
    };
  }

  /**
   * Run one planned trial through the engine and map its result into a persisted
   * {@link TrialResponse}. Extracted from the block loop so criterion-based
   * practice (E-REACT-4) can re-run a group of trials without duplicating the
   * scheduled-phase wiring and result mapping.
   */
  private async runPlannedTrial(
    engine: ReactionEngine,
    planned: PlannedReactionTrial,
    trialNumber: number,
    context: QuestionRuntimeContext,
    counterbalanceCell: string | null
  ): Promise<TrialResponse> {
    engine.clearScheduledPhases();
    const scheduledPhases = planned.metadata.scheduledPhases || [];
    scheduledPhases.forEach((phase) => {
      engine.schedulePhase(phase);
    });

    const trialResult = await engine.runTrial(planned.trial, context.abortSignal);

    const keyValue =
      trialResult.response && typeof trialResult.response.value === 'string'
        ? trialResult.response.value
        : null;

    return {
      trialId: planned.trial.id,
      trialNumber,
      isPractice: planned.metadata.isPractice,
      taskType: planned.metadata.taskType,
      blockId: planned.metadata.blockId,
      condition: planned.metadata.condition || null,
      trialTemplateId: planned.metadata.trialTemplateId || null,
      stimulusKind: planned.trial.stimulus?.kind ?? null,
      key: keyValue,
      optionId: trialResult.response?.optionId ?? null,
      responseSource: trialResult.response?.responseSource ?? null,
      binding: trialResult.response?.binding ?? null,
      reactionTime: trialResult.response?.reactionTimeMs ?? null,
      rawRtMs: trialResult.response?.rawRtMs ?? null,
      isCorrect: trialResult.isCorrect,
      timeout: trialResult.timeout,
      anticipatory: trialResult.anticipatory,
      falseStartCount: trialResult.falseStartCount,
      stimulusOnsetTime: trialResult.stimulusOnsetTime,
      stimulusOffsetTime: trialResult.stimulusOffsetTime,
      expectedResponse: planned.metadata.expectedResponse || null,
      isTarget: planned.metadata.isTarget ?? null,
      responseTimingMethod: trialResult.response?.timingMethod || null,
      responseDevice: trialResult.response?.responseDevice || null,
      holdDurationMs: trialResult.response?.holdDurationMs ?? null,
      gamepadButtonIndex: trialResult.response?.gamepadButtonIndex ?? null,
      stimulusTimingMethod: trialResult.stimulusTimingMethod || null,
      displayLatencyMs: trialResult.displayLatencyMs ?? null,
      outputLatencyMs: trialResult.outputLatencyMs ?? null,
      offsetMethod: trialResult.offsetMethod ?? null,
      actualDurationFrames: trialResult.actualDurationFrames ?? null,
      videoFrameCount: trialResult.videoFrames?.length ?? 0,
      phaseTimeline: compactPhaseTimeline(trialResult.phaseTimeline),
      frameStats: {
        fps: trialResult.stats.fps,
        droppedFrames: trialResult.stats.droppedFrames,
        jitter: trialResult.stats.jitter,
      },
      // Environment / degradation provenance (W-2 / W-3 / W-6) so the persisted
      // per-trial row + aggregate blob identify degraded timing (ADR 0027).
      crossOriginIsolated: trialResult.provenance.crossOriginIsolated,
      timerResolutionMs: trialResult.provenance.timerResolutionMs,
      measuredRefreshRateHz: trialResult.provenance.measuredRefreshRateHz ?? null,
      visibilityInvalidated: trialResult.provenance.invalidated === 'visibility',
      invalid: trialResult.invalid ?? false,
      invalidReason: trialResult.invalidReason ?? null,
      counterbalanceCell,
    };
  }

  public teardown(): void {
    this.engine?.destroy();
    this.engine = null;
  }
}

/**
 * Split a flat trial plan into consecutive runs that share a block id
 * (E-REACT-4). A block "run" is the unit criterion-based practice re-runs — all
 * of a practice block's trials (across its repetitions) form one group, followed
 * by the next block's group.
 */
function groupIntoBlockRuns(plan: PlannedReactionTrial[]): PlannedReactionTrial[][] {
  const groups: PlannedReactionTrial[][] = [];
  let current: PlannedReactionTrial[] | null = null;
  let currentBlockId: string | null = null;

  for (const planned of plan) {
    const blockId = planned.metadata.blockId;
    if (!current || blockId !== currentBlockId) {
      current = [];
      currentBlockId = blockId;
      groups.push(current);
    }
    current.push(planned);
  }

  return groups;
}

/**
 * Proportion correct across the scored trials of a practice attempt (E-REACT-4).
 * Trials whose correctness was not scored (`isCorrect === null`) are excluded;
 * when nothing was scored the attempt counts as passing (accuracy 1) so a block
 * without correctness scoring cannot loop forever.
 */
function practiceAccuracy(responses: TrialResponse[]): number {
  const scored = responses.filter((response) => response.isCorrect !== null);
  if (scored.length === 0) return 1;
  return scored.filter((response) => response.isCorrect).length / scored.length;
}

function summarizeByDimension(
  responses: TrialResponse[],
  keyResolver: (response: TrialResponse) => string
): Record<string, { count: number; meanRT: number; accuracy: number; timeoutRate: number }> {
  const buckets = new Map<
    string,
    { total: number; correct: number; timeout: number; rt: number[] }
  >();

  responses.forEach((response) => {
    const key = keyResolver(response);
    if (!buckets.has(key)) {
      buckets.set(key, { total: 0, correct: 0, timeout: 0, rt: [] });
    }

    const bucket = buckets.get(key)!;
    bucket.total++;
    if (response.timeout) bucket.timeout++;
    if (response.isCorrect) bucket.correct++;
    if (
      typeof response.reactionTime === 'number' &&
      response.reactionTime > 0 &&
      !response.timeout
    ) {
      bucket.rt.push(response.reactionTime);
    }
  });

  const summary: Record<string, { count: number; meanRT: number; accuracy: number; timeoutRate: number }> =
    {};

  buckets.forEach((bucket, key) => {
    summary[key] = {
      count: bucket.total,
      meanRT:
        bucket.rt.length > 0
          ? bucket.rt.reduce((sum, value) => sum + value, 0) / bucket.rt.length
          : 0,
      accuracy: bucket.total > 0 ? bucket.correct / bucket.total : 0,
      timeoutRate: bucket.total > 0 ? bucket.timeout / bucket.total : 0,
    };
  });

  return summary;
}
