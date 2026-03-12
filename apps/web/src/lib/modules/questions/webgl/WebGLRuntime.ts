import type {
  IQuestionRuntime,
  QuestionRuntimeContext,
  QuestionRuntimeResult,
} from '$lib/runtime/core/question-runtime';
import { ReactionEngine } from '$lib/runtime/reaction';
import type { ReactionTrialConfig } from '$lib/runtime/reaction';
import { normalizeWebGLQuestionConfig } from './model/webgl-config';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic questionnaire payload
  private toTrialConfig(question: any): ReactionTrialConfig {
    const config = normalizeWebGLQuestionConfig(question);
    const normalizeColor = (
      input: unknown
    ): [number, number, number, number] | undefined => {
      if (
        Array.isArray(input) &&
        input.length === 4 &&
        input.every((value) => typeof value === 'number')
      ) {
        return [input[0]!, input[1]!, input[2]!, input[3]!];
      }
      return undefined;
    };

    const stimulusConfig = config.stimulus.content;
    const stimulus =
      config.stimulus.type === 'image'
        ? {
            kind: 'image' as const,
            src: typeof stimulusConfig === 'string' ? stimulusConfig : '',
            widthPx: 320,
            heightPx: 320,
          }
        : config.stimulus.type === 'video'
          ? {
              kind: 'video' as const,
              src: typeof stimulusConfig === 'string' ? stimulusConfig : '',
              widthPx: 480,
              heightPx: 320,
              autoplay: true,
              muted: true,
            }
          : config.stimulus.type === 'custom'
            ? {
                kind: 'custom' as const,
                shader:
                  typeof stimulusConfig === 'object' ? stimulusConfig.properties.shader || '' : '',
                vertices:
                  typeof stimulusConfig === 'object'
                    ? stimulusConfig.properties.vertices || []
                    : [],
              }
            : {
                kind: 'shape' as const,
                shape: (typeof stimulusConfig === 'object' ? stimulusConfig.type : 'circle') as
                  | 'circle'
                  | 'square'
                  | 'rectangle'
                  | 'triangle',
                radiusPx:
                  typeof stimulusConfig === 'object'
                    ? stimulusConfig.properties.radius
                    : undefined,
                widthPx:
                  typeof stimulusConfig === 'object' ? stimulusConfig.properties.width : undefined,
                heightPx:
                  typeof stimulusConfig === 'object'
                    ? stimulusConfig.properties.height
                    : undefined,
                color:
                  typeof stimulusConfig === 'object'
                    ? normalizeColor(stimulusConfig.properties.color)
                    : undefined,
              };

    return {
      id: `webgl-${question.id}`,
      responseMode: config.response.type,
      validKeys: config.response.validKeys,
      correctResponse: config.response.correctKey,
      requireCorrect: config.response.requireCorrect,
      fixation: {
        enabled: config.stimulus.fixation.show,
        type: config.stimulus.fixation.type,
        durationMs: config.stimulus.fixation.duration,
      },
      preStimulusDelayMs: config.timing.preDelay + config.timing.postFixationDelay,
      stimulus,
      stimulusDurationMs: config.timing.stimulusDuration,
      responseTimeoutMs: config.timing.responseDuration,
      interTrialIntervalMs: config.timing.interTrialInterval,
      targetFPS: config.rendering.targetFPS,
      vsync: config.rendering.vsync,
    };
  }
}
