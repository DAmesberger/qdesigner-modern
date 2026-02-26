import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine } from '$lib/runtime/reaction';
import type { ReactionTrialConfig } from '$lib/runtime/reaction';

interface ReactionTimeQuestionConfig {
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

interface TrialResponse {
  trialNumber: number;
  isPractice: boolean;
  key: string | null;
  reactionTime: number | null;
  isCorrect: boolean | null;
  timeout: boolean;
  stimulusOnsetTime: number | null;
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
    const practiceTrials = config.practice ? config.practiceTrials || 3 : 0;
    const testTrials = config.testTrials || 10;
    const allResponses: TrialResponse[] = [];

    for (let trial = 0; trial < practiceTrials + testTrials; trial++) {
      const isPractice = trial < practiceTrials;
      const trialResult = await engine.runTrial(
        this.toTrialConfig(config, trial + 1, isPractice),
        context.abortSignal
      );

      const keyValue =
        trialResult.response && typeof trialResult.response.value === 'string'
          ? trialResult.response.value
          : null;

      allResponses.push({
        trialNumber: trial + 1,
        isPractice,
        key: keyValue,
        reactionTime: trialResult.response?.reactionTimeMs ?? null,
        isCorrect: trialResult.isCorrect,
        timeout: trialResult.timeout,
        stimulusOnsetTime: trialResult.stimulusOnsetTime,
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
        practiceTrials,
        testTrials,
      },
    };
  }

  public teardown(): void {
    this.engine?.destroy();
    this.engine = null;
  }

  private getConfig(question: any): Required<ReactionTimeQuestionConfig> {
    const config = (question.config || question.display || {}) as ReactionTimeQuestionConfig;
    return {
      stimulus: {
        type: config.stimulus?.type || 'shape',
        content: config.stimulus?.content || 'circle',
        fixation: {
          type: config.stimulus?.fixation?.type || 'cross',
          duration: config.stimulus?.fixation?.duration || 500,
        },
      },
      response: {
        validKeys: config.response?.validKeys || ['f', 'j'],
        timeout: config.response?.timeout || 2000,
        requireCorrect: config.response?.requireCorrect || false,
      },
      correctKey: config.correctKey || '',
      feedback: config.feedback !== false,
      practice: config.practice || false,
      practiceTrials: config.practiceTrials || 3,
      testTrials: config.testTrials || 10,
      targetFPS: config.targetFPS || 120,
    };
  }

  private toTrialConfig(
    config: Required<ReactionTimeQuestionConfig>,
    trialNumber: number,
    isPractice: boolean
  ): ReactionTrialConfig {
    const stimulusType = config.stimulus.type;
    const stimulusContent = config.stimulus.content;

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
        type: config.stimulus.fixation.type,
        durationMs: config.stimulus.fixation.duration,
      },
      stimulus,
      responseTimeoutMs: config.response.timeout,
      targetFPS: config.targetFPS,
      interTrialIntervalMs: isPractice ? 300 : 500,
    };
  }
}
