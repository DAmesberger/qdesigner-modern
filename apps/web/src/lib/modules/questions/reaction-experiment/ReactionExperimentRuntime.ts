import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine } from '$lib/runtime/reaction';
import { computeDerivedReactionMetrics } from '$lib/modules/questions/reaction-time/model/reaction-scoring';
import type { ReactionTaskType } from '$lib/modules/questions/reaction-time/model/reaction-schema';
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
    });

    this.engine.seedFromResourceManager(context.resourceManager);
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
    const trialPlan = compileReactionExperimentPlan(config, {
      questionnaire: context.questionnaire,
      question: context.question,
      variableEngine: context.variableEngine,
    });

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
        key,
        reactionTime: result.response?.reactionTimeMs ?? null,
        isCorrect: result.isCorrect,
        timeout: result.timeout,
        stimulusOnsetTime: result.stimulusOnsetTime,
        expectedResponse: planned.metadata.expectedResponse || null,
        isTarget: planned.metadata.isTarget ?? null,
        responseTimingMethod: result.response?.timingMethod || null,
        stimulusTimingMethod: result.stimulusTimingMethod || null,
        frameStats: {
          fps: result.stats.fps,
          droppedFrames: result.stats.droppedFrames,
          jitter: result.stats.jitter,
        },
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
      },
    };
  }

  public teardown(): void {
    this.engine?.destroy();
    this.engine = null;
  }
}
