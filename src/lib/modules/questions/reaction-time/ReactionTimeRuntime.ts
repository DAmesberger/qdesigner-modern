import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine } from '$lib/runtime/reaction';
import { compileReactionPlan } from './model/reaction-compiler';
import { normalizeReactionQuestionConfig } from './model/reaction-normalize';
import { computeDerivedReactionMetrics } from './model/reaction-scoring';
import type { ReactionTaskType } from './model/reaction-schema';

interface TrialResponse {
  trialId: string;
  trialNumber: number;
  isPractice: boolean;
  taskType: ReactionTaskType;
  blockId: string;
  condition: string | null;
  trialTemplateId: string | null;
  key: string | null;
  reactionTime: number | null;
  isCorrect: boolean | null;
  timeout: boolean;
  stimulusOnsetTime: number | null;
  expectedResponse: string | null;
  isTarget: boolean | null;
  responseTimingMethod: string | null;
  stimulusTimingMethod: string | null;
  frameStats: {
    fps: number;
    droppedFrames: number;
    jitter: number;
  };
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
    });

    this.engine.seedFromResourceManager(context.resourceManager);
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
    const trialPlan = compileReactionPlan(config, {
      questionnaire: context.questionnaire,
      question: context.question,
    });

    const blockStimuli = trialPlan.map((planned) => planned.trial.stimulus).filter(Boolean);
    await engine.warmUpStimuli(blockStimuli);

    const allResponses: TrialResponse[] = [];

    for (let index = 0; index < trialPlan.length; index++) {
      const planned = trialPlan[index]!;

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

      allResponses.push({
        trialId: planned.trial.id,
        trialNumber: index + 1,
        isPractice: planned.metadata.isPractice,
        taskType: planned.metadata.taskType,
        blockId: planned.metadata.blockId,
        condition: planned.metadata.condition || null,
        trialTemplateId: planned.metadata.trialTemplateId || null,
        key: keyValue,
        reactionTime: trialResult.response?.reactionTimeMs ?? null,
        isCorrect: trialResult.isCorrect,
        timeout: trialResult.timeout,
        stimulusOnsetTime: trialResult.stimulusOnsetTime,
        expectedResponse: planned.metadata.expectedResponse || null,
        isTarget: planned.metadata.isTarget ?? null,
        responseTimingMethod: trialResult.response?.timingMethod || null,
        stimulusTimingMethod: trialResult.stimulusTimingMethod || null,
        frameStats: {
          fps: trialResult.stats.fps,
          droppedFrames: trialResult.stats.droppedFrames,
          jitter: trialResult.stats.jitter,
        },
      });
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
      },
    };
  }

  public teardown(): void {
    this.engine?.destroy();
    this.engine = null;
  }
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
