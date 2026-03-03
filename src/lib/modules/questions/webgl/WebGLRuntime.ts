import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine } from '$lib/runtime/reaction';
import type { ReactionTrialConfig } from '$lib/runtime/reaction';

interface WebGLQuestionConfig {
  stimulus?: {
    type?: 'shape' | 'image' | 'video' | 'custom';
    content?: any;
    fixation?: {
      show?: boolean;
      type?: 'cross' | 'dot';
      duration?: number;
      color?: string;
    };
  };
  response?: {
    type?: 'keyboard' | 'mouse' | 'touch';
    validKeys?: string[];
    requireCorrect?: boolean;
    correctKey?: string;
  };
  timing?: {
    preDelay?: number;
    postFixationDelay?: number;
    stimulusDuration?: number;
    responseDuration?: number;
    interTrialInterval?: number;
  };
  rendering?: {
    targetFPS?: number;
    vsync?: boolean;
    antialias?: boolean;
  };
}

export class WebGLRuntime implements IQuestionRuntime {
  public readonly type = 'webgl';

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

    // Seed the engine's caches with preloaded assets from ResourceManager
    this.engine.seedFromResourceManager(context.resourceManager);
  }

  public async run(context: QuestionRuntimeContext): Promise<QuestionRuntimeResult> {
    if (!this.engine) {
      await this.prepare(context);
    }

    const engine = this.engine;
    if (!engine) {
      throw new Error('WebGLRuntime failed to initialize reaction engine');
    }

    const trialConfig = this.toTrialConfig(context.question);
    const result = await engine.runTrial(trialConfig, context.abortSignal);

    return {
      value: {
        response:
          result.response && typeof result.response.value === 'string'
            ? result.response.value
            : result.response?.value || null,
        reactionTime: result.response?.reactionTimeMs ?? -1,
        stimulusOnset: result.stimulusOnsetTime,
        responseTime: result.response?.timestamp ?? null,
        frameTimings: result.frameLog.map((sample) => sample.now),
        isCorrect: result.isCorrect,
        timeout: result.timeout,
      },
      reactionTimeMs: result.response?.reactionTimeMs ?? null,
      isCorrect: result.isCorrect,
      timedOut: result.timeout,
      metadata: {
        frameStats: result.stats,
      },
    };
  }

  public teardown(): void {
    this.engine?.destroy();
    this.engine = null;
  }

  private toTrialConfig(question: any): ReactionTrialConfig {
    const config = (question.config || question.display || {}) as WebGLQuestionConfig;

    const stimulusConfig = config.stimulus?.content || {};
    const stimulus =
      config.stimulus?.type === 'image'
        ? {
            kind: 'image' as const,
            src:
              typeof config.stimulus.content === 'string'
                ? config.stimulus.content
                : stimulusConfig.src || '',
            widthPx: stimulusConfig.width || 320,
            heightPx: stimulusConfig.height || 320,
          }
        : config.stimulus?.type === 'video'
          ? {
              kind: 'video' as const,
              src:
                typeof config.stimulus.content === 'string'
                  ? config.stimulus.content
                  : stimulusConfig.src || '',
              widthPx: stimulusConfig.width || 480,
              heightPx: stimulusConfig.height || 320,
              autoplay: true,
              muted: true,
            }
          : config.stimulus?.type === 'custom'
            ? {
                kind: 'custom' as const,
                shader: stimulusConfig.properties?.shader || '',
                vertices: stimulusConfig.properties?.vertices || [],
              }
            : {
                kind: 'shape' as const,
                shape: (stimulusConfig.type || 'circle') as
                  | 'circle'
                  | 'square'
                  | 'rectangle'
                  | 'triangle',
                radiusPx: stimulusConfig.properties?.radius,
                widthPx: stimulusConfig.properties?.width,
                heightPx: stimulusConfig.properties?.height,
                color: stimulusConfig.properties?.color,
              };

    return {
      id: `webgl-${question.id}`,
      responseMode: (config.response?.type || 'keyboard') as 'keyboard' | 'mouse' | 'touch',
      validKeys: config.response?.validKeys || ['f', 'j'],
      correctResponse: config.response?.correctKey,
      requireCorrect: config.response?.requireCorrect,
      fixation: {
        enabled: config.stimulus?.fixation?.show ?? true,
        type: config.stimulus?.fixation?.type || 'cross',
        durationMs: config.stimulus?.fixation?.duration || 500,
      },
      preStimulusDelayMs: (config.timing?.preDelay || 0) + (config.timing?.postFixationDelay || 0),
      stimulus,
      stimulusDurationMs: config.timing?.stimulusDuration,
      responseTimeoutMs: config.timing?.responseDuration || 2000,
      interTrialIntervalMs: config.timing?.interTrialInterval || 0,
      targetFPS: config.rendering?.targetFPS || 120,
      vsync: config.rendering?.vsync ?? true,
    };
  }
}
