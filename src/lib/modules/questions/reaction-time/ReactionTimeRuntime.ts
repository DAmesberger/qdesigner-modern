import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine, createNBackTrials } from '$lib/runtime/reaction';
import type { ReactionStimulusConfig, ReactionTrialConfig } from '$lib/runtime/reaction';

type ReactionTaskType = 'standard' | 'n-back' | 'custom';

interface ReactionTimeQuestionConfig {
  task?: {
    type?: ReactionTaskType;
    nBack?: {
      n?: number;
      sequenceLength?: number;
      targetRate?: number;
      stimulusSet?: Array<string | ReactionStimulusConfig>;
      targetKey?: string;
      nonTargetKey?: string;
      fixationMs?: number;
      responseTimeoutMs?: number;
    };
    customTrials?: Array<
      Partial<ReactionTrialConfig> & {
        isPractice?: boolean;
        isTarget?: boolean;
        expectedResponse?: string;
        stimulus?: ReactionStimulusConfig | string;
      }
    >;
  };
  stimulus?: {
    type?: 'text' | 'shape' | 'image';
    content?: string;
    fixation?: {
      type?: 'cross' | 'dot';
      duration?: number;
    };
  };
  response?: {
    validKeys?: string[];
    timeout?: number;
    requireCorrect?: boolean;
  };
  correctKey?: string;
  feedback?: boolean;
  practice?: boolean;
  practiceTrials?: number;
  testTrials?: number;
  targetFPS?: number;
}

interface NormalizedReactionConfig {
  task: {
    type: ReactionTaskType;
    nBack: {
      n: number;
      sequenceLength: number;
      targetRate: number;
      stimulusSet: Array<string | ReactionStimulusConfig>;
      targetKey: string;
      nonTargetKey: string;
      fixationMs: number;
      responseTimeoutMs: number;
    };
    customTrials: Array<
      Partial<ReactionTrialConfig> & {
        isPractice?: boolean;
        isTarget?: boolean;
        expectedResponse?: string;
        stimulus?: ReactionStimulusConfig | string;
      }
    >;
  };
  stimulus: {
    type: 'text' | 'shape' | 'image';
    content: string;
    fixation: {
      type: 'cross' | 'dot';
      duration: number;
    };
  };
  response: {
    validKeys: string[];
    timeout: number;
    requireCorrect: boolean;
  };
  correctKey: string;
  feedback: boolean;
  practice: boolean;
  practiceTrials: number;
  testTrials: number;
  targetFPS: number;
}

interface PlannedTrial {
  trial: ReactionTrialConfig;
  isPractice: boolean;
  taskType: ReactionTaskType;
  isTarget?: boolean;
  expectedResponse?: string;
}

interface TrialResponse {
  trialId: string;
  trialNumber: number;
  isPractice: boolean;
  taskType: ReactionTaskType;
  key: string | null;
  reactionTime: number | null;
  isCorrect: boolean | null;
  timeout: boolean;
  stimulusOnsetTime: number | null;
  expectedResponse: string | null;
  isTarget: boolean | null;
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
  }

  public async run(context: QuestionRuntimeContext): Promise<QuestionRuntimeResult> {
    if (!this.engine) {
      await this.prepare(context);
    }

    const engine = this.engine;
    if (!engine) {
      throw new Error('ReactionTimeRuntime failed to initialize reaction engine');
    }

    const config = this.getConfig(context.question);
    const trialPlan = this.buildTrialPlan(config, context);
    const allResponses: TrialResponse[] = [];

    for (let index = 0; index < trialPlan.length; index++) {
      const planned = trialPlan[index]!;
      const trialResult = await engine.runTrial(planned.trial, context.abortSignal);

      const keyValue =
        trialResult.response && typeof trialResult.response.value === 'string'
          ? trialResult.response.value
          : null;

      allResponses.push({
        trialId: planned.trial.id,
        trialNumber: index + 1,
        isPractice: planned.isPractice,
        taskType: planned.taskType,
        key: keyValue,
        reactionTime: trialResult.response?.reactionTimeMs ?? null,
        isCorrect: trialResult.isCorrect,
        timeout: trialResult.timeout,
        stimulusOnsetTime: trialResult.stimulusOnsetTime,
        expectedResponse: planned.expectedResponse || null,
        isTarget: planned.isTarget ?? null,
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

    return {
      value: {
        responses: allResponses,
        averageRT,
        accuracy,
        timeouts: testResponses.filter((response) => response.timeout).length,
      },
      reactionTimeMs: averageRT,
      isCorrect: accuracy !== null ? accuracy >= 0.5 : null,
      timedOut: testResponses.every((response) => response.timeout),
      metadata: {
        trialCount: allResponses.length,
        practiceTrials: allResponses.filter((response) => response.isPractice).length,
        testTrials: testResponses.length,
        taskType: config.task.type,
      },
    };
  }

  public teardown(): void {
    this.engine?.destroy();
    this.engine = null;
  }

  private getConfig(question: any): NormalizedReactionConfig {
    const config = (question.config || question.display || {}) as ReactionTimeQuestionConfig;
    const validKeys = config.response?.validKeys || ['f', 'j'];

    return {
      task: {
        type:
          config.task?.type === 'n-back' || config.task?.type === 'custom'
            ? config.task.type
            : 'standard',
        nBack: {
          n: Math.max(1, config.task?.nBack?.n || 2),
          sequenceLength: Math.max(
            3,
            config.task?.nBack?.sequenceLength || config.testTrials || 20
          ),
          targetRate: Math.min(1, Math.max(0, config.task?.nBack?.targetRate ?? 0.3)),
          stimulusSet: config.task?.nBack?.stimulusSet || ['A', 'B', 'C', 'D'],
          targetKey: config.task?.nBack?.targetKey || validKeys[0] || 'j',
          nonTargetKey: config.task?.nBack?.nonTargetKey || validKeys[1] || validKeys[0] || 'f',
          fixationMs: config.task?.nBack?.fixationMs || 400,
          responseTimeoutMs: config.task?.nBack?.responseTimeoutMs || 1200,
        },
        customTrials: Array.isArray(config.task?.customTrials) ? config.task.customTrials : [],
      },
      stimulus: {
        type: config.stimulus?.type || 'shape',
        content: config.stimulus?.content || 'circle',
        fixation: {
          type: config.stimulus?.fixation?.type || 'cross',
          duration: config.stimulus?.fixation?.duration || 500,
        },
      },
      response: {
        validKeys,
        timeout: config.response?.timeout || 2000,
        requireCorrect: config.response?.requireCorrect || false,
      },
      correctKey: config.correctKey || '',
      feedback: config.feedback !== false,
      practice: config.practice || false,
      practiceTrials: Math.max(0, config.practiceTrials || 3),
      testTrials: Math.max(1, config.testTrials || 10),
      targetFPS: Math.max(30, config.targetFPS || 120),
    };
  }

  private buildTrialPlan(
    config: NormalizedReactionConfig,
    context: QuestionRuntimeContext
  ): PlannedTrial[] {
    if (config.task.type === 'n-back') {
      return this.buildNBackTrialPlan(config, context);
    }

    if (config.task.type === 'custom') {
      const customPlan = this.buildCustomTrialPlan(config);
      if (customPlan.length > 0) {
        return customPlan;
      }
    }

    return this.buildStandardTrialPlan(config);
  }

  private buildStandardTrialPlan(config: NormalizedReactionConfig): PlannedTrial[] {
    const practiceTrials = config.practice ? config.practiceTrials : 0;
    const total = practiceTrials + config.testTrials;
    const plan: PlannedTrial[] = [];

    for (let trial = 0; trial < total; trial++) {
      const isPractice = trial < practiceTrials;
      plan.push({
        trial: this.toStandardTrialConfig(config, trial + 1, isPractice),
        isPractice,
        taskType: 'standard',
      });
    }

    return plan;
  }

  private buildNBackTrialPlan(
    config: NormalizedReactionConfig,
    context: QuestionRuntimeContext
  ): PlannedTrial[] {
    const seedRoot =
      context.questionnaire?.settings?.randomizationSeed || context.question?.id || 'reaction-time';

    const stimulusSet = this.toNBackStimulusSet(config.task.nBack.stimulusSet);
    const practiceLength = Math.max(config.task.nBack.n + 2, config.practiceTrials);
    const practiceTrials =
      config.practice && config.practiceTrials > 0
        ? createNBackTrials({
            n: config.task.nBack.n,
            sequenceLength: practiceLength,
            targetRate: config.task.nBack.targetRate,
            stimulusSet,
            validKeys: config.response.validKeys,
            targetKey: config.task.nBack.targetKey,
            nonTargetKey: config.task.nBack.nonTargetKey,
            fixationMs: config.task.nBack.fixationMs,
            responseTimeoutMs: config.task.nBack.responseTimeoutMs,
            targetFPS: config.targetFPS,
            seed: `${seedRoot}:nback:practice`,
          }).slice(0, config.practiceTrials)
        : [];

    const testTrials = createNBackTrials({
      n: config.task.nBack.n,
      sequenceLength: config.task.nBack.sequenceLength,
      targetRate: config.task.nBack.targetRate,
      stimulusSet,
      validKeys: config.response.validKeys,
      targetKey: config.task.nBack.targetKey,
      nonTargetKey: config.task.nBack.nonTargetKey,
      fixationMs: config.task.nBack.fixationMs,
      responseTimeoutMs: config.task.nBack.responseTimeoutMs,
      targetFPS: config.targetFPS,
      seed: `${seedRoot}:nback:test`,
    });

    const plan: PlannedTrial[] = [];

    practiceTrials.forEach((trial) => {
      plan.push({
        trial,
        isPractice: true,
        taskType: 'n-back',
        isTarget: trial.isTarget,
        expectedResponse: trial.expectedResponse,
      });
    });

    testTrials.forEach((trial) => {
      plan.push({
        trial,
        isPractice: false,
        taskType: 'n-back',
        isTarget: trial.isTarget,
        expectedResponse: trial.expectedResponse,
      });
    });

    return plan;
  }

  private buildCustomTrialPlan(config: NormalizedReactionConfig): PlannedTrial[] {
    const customTrials = config.task.customTrials;
    const plan: PlannedTrial[] = [];

    customTrials.forEach((candidate, index) => {
      const trial = this.normalizeCustomTrial(candidate, config, index + 1);
      if (!trial) return;

      plan.push({
        trial,
        isPractice: Boolean(candidate.isPractice),
        taskType: 'custom',
        isTarget: candidate.isTarget,
        expectedResponse:
          typeof candidate.expectedResponse === 'string'
            ? candidate.expectedResponse
            : trial.correctResponse,
      });
    });

    return plan;
  }

  private normalizeCustomTrial(
    trial: Partial<ReactionTrialConfig> & {
      stimulus?: ReactionStimulusConfig | string;
    },
    config: NormalizedReactionConfig,
    trialNumber: number
  ): ReactionTrialConfig | null {
    const stimulus = this.normalizeStimulusCandidate(trial.stimulus);
    if (!stimulus) return null;

    return {
      id: trial.id || `custom-${trialNumber}`,
      responseMode: trial.responseMode || 'keyboard',
      validKeys: trial.validKeys || config.response.validKeys,
      correctResponse: trial.correctResponse || undefined,
      requireCorrect: trial.requireCorrect ?? config.response.requireCorrect,
      fixation: {
        enabled: trial.fixation?.enabled ?? true,
        type: trial.fixation?.type || config.stimulus.fixation.type,
        durationMs: trial.fixation?.durationMs ?? config.stimulus.fixation.duration,
        color: trial.fixation?.color,
        sizePx: trial.fixation?.sizePx,
      },
      preStimulusDelayMs: trial.preStimulusDelayMs,
      stimulus,
      stimulusDurationMs: trial.stimulusDurationMs,
      responseTimeoutMs: trial.responseTimeoutMs ?? config.response.timeout,
      interTrialIntervalMs: trial.interTrialIntervalMs ?? 300,
      targetFPS: trial.targetFPS ?? config.targetFPS,
      vsync: trial.vsync,
      backgroundColor: trial.backgroundColor,
      allowResponseDuringPreStimulus: trial.allowResponseDuringPreStimulus,
    };
  }

  private normalizeStimulusCandidate(
    stimulus?: ReactionStimulusConfig | string
  ): ReactionStimulusConfig | null {
    if (!stimulus) return null;

    if (typeof stimulus === 'string') {
      return {
        kind: 'text',
        text: stimulus,
      };
    }

    if (!stimulus.kind) return null;
    return stimulus;
  }

  private toNBackStimulusSet(
    stimuli: Array<string | ReactionStimulusConfig>
  ): ReactionStimulusConfig[] {
    const mapped = stimuli
      .map((entry) => {
        if (typeof entry === 'string') {
          return {
            kind: 'text' as const,
            text: entry,
            fontPx: 72,
          };
        }

        return entry;
      })
      .filter(Boolean);

    if (mapped.length > 0) {
      return mapped;
    }

    return ['A', 'B', 'C', 'D'].map((text) => ({
      kind: 'text' as const,
      text,
      fontPx: 72,
    }));
  }

  private toStandardTrialConfig(
    config: NormalizedReactionConfig,
    trialNumber: number,
    isPractice: boolean
  ): ReactionTrialConfig {
    const stimulusType = config.stimulus.type;
    const stimulusContent = config.stimulus.content || '';
    const fixation = config.stimulus.fixation ?? { type: 'cross' as const, duration: 500 };

    const stimulus =
      stimulusType === 'text'
        ? {
            kind: 'text' as const,
            text: stimulusContent,
            fontPx: 72,
          }
        : stimulusType === 'image'
          ? {
              kind: 'image' as const,
              src: stimulusContent,
              widthPx: 360,
              heightPx: 360,
            }
          : {
              kind: 'shape' as const,
              shape:
                stimulusContent === 'square'
                  ? ('square' as const)
                  : stimulusContent === 'triangle'
                    ? ('triangle' as const)
                    : ('circle' as const),
              radiusPx: 80,
            };

    return {
      id: `reaction-time-${trialNumber}`,
      responseMode: 'keyboard',
      validKeys: config.response.validKeys,
      correctResponse: config.correctKey || undefined,
      requireCorrect: config.response.requireCorrect,
      fixation: {
        enabled: true,
        type: fixation.type ?? 'cross',
        durationMs: fixation.duration ?? 500,
      },
      stimulus,
      responseTimeoutMs: config.response.timeout ?? 2000,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: isPractice ? 300 : 500,
    };
  }
}
