<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import { ReactionEngine } from '$lib/runtime/reaction';
  import type { ReactionTrialConfig, ReactionTrialResult } from '$lib/runtime/reaction';
  import type { WebGLConfig } from './model/webgl-config';
  import { normalizeWebGLQuestionConfig } from './model/webgl-config';

  interface WebGLValue {
    response: string | { x: number; y: number } | null;
    reactionTime: number;
    stimulusOnset: number | null;
    responseTime: number | null;
    frameTimings: number[];
    isCorrect?: boolean | null;
    timeout?: boolean;
    frameStats?: {
      fps: number;
      droppedFrames: number;
      jitter: number;
    };
  }

  interface Props extends Omit<QuestionProps, 'question'> {
    question: any;
  }

  let {
    question = $bindable(),
    mode = 'runtime',
    value = $bindable(),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  const config = $derived(normalizeWebGLQuestionConfig(question));

  let canvas = $state<HTMLCanvasElement>();
  let engine = $state<ReactionEngine | null>(null);
  let runState = $state<'ready' | 'running' | 'complete'>('ready');
  let abortController = $state<AbortController | null>(null);

  $effect(() => {
    if (!value) {
      value = {
        response: null,
        reactionTime: -1,
        stimulusOnset: null,
        responseTime: null,
        frameTimings: [],
        timeout: false,
      } satisfies WebGLValue;
    }
  });

  $effect(() => {
    if (canvas && !engine && mode === 'runtime') {
      engine = new ReactionEngine({
        canvas,
        eventTarget: document,
      });
    }

    return () => {
      abortController?.abort();
      engine?.destroy();
      engine = null;
    };
  });

  $effect(() => {
    if (mode !== 'runtime' || disabled || !engine || runState !== 'ready') {
      return;
    }

    void startTrial();
  });

  async function startTrial() {
    if (!engine || disabled) return;

    abortController?.abort();
    abortController = new AbortController();
    runState = 'running';

    onInteraction?.({
      type: 'presentation-start' as any,
      timestamp: Date.now(),
      data: {
        targetFPS: config.rendering?.targetFPS || 120,
      },
    });

    let result: ReactionTrialResult;
    try {
      result = await engine.runTrial(buildTrialConfig(), abortController.signal);
    } catch (error) {
      if (isAbortError(error)) {
        runState = 'ready';
        return;
      }
      throw error;
    }

    value = mapResult(result);
    onResponse?.(value);
    runState = 'complete';

    onValidation?.({
      valid: !value.timeout,
      errors: value.timeout ? ['Response timeout'] : [],
    });

    onInteraction?.({
      type: value.timeout ? ('timeout' as any) : ('response' as any),
      timestamp: Date.now(),
      data: {
        reactionTime: value.reactionTime,
        isCorrect: value.isCorrect,
      },
    });
  }

  function buildTrialConfig(): ReactionTrialConfig {
    const stimulusType = config.stimulus?.type || 'shape';
    const content = config.stimulus?.content;
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

    const stimulus =
      stimulusType === 'image'
        ? {
            kind: 'image' as const,
            src: typeof content === 'string' ? content : '',
            widthPx: 360,
            heightPx: 360,
          }
        : stimulusType === 'video'
          ? {
              kind: 'video' as const,
              src: typeof content === 'string' ? content : '',
              widthPx: 480,
              heightPx: 320,
              autoplay: true,
              muted: true,
            }
          : stimulusType === 'custom' && typeof content === 'object'
            ? {
                kind: 'custom' as const,
                shader: content.properties.shader || '',
                vertices: content.properties.vertices || [],
              }
            : {
                kind: 'shape' as const,
                shape: (typeof content === 'object' ? content.type : 'circle') as
                  | 'circle'
                  | 'square'
                  | 'rectangle'
                  | 'triangle',
                radiusPx: typeof content === 'object' ? content.properties.radius : 70,
                widthPx: typeof content === 'object' ? content.properties.width : 120,
                heightPx: typeof content === 'object' ? content.properties.height : 120,
                color:
                  typeof content === 'object'
                    ? normalizeColor(content.properties.color)
                    : undefined,
              };

    return {
      id: `${question.id}-trial`,
      responseMode: (config.response?.type || 'keyboard') as 'keyboard' | 'mouse' | 'touch',
      validKeys: config.response?.validKeys || ['f', 'j'],
      requireCorrect: config.response?.requireCorrect,
      correctResponse: config.response?.correctKey,
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

  function mapResult(result: ReactionTrialResult): WebGLValue {
    return {
      response: result.response?.value || null,
      reactionTime: result.response?.reactionTimeMs ?? -1,
      stimulusOnset: result.stimulusOnsetTime,
      responseTime: result.response?.timestamp || null,
      frameTimings: result.frameLog.map((sample) => sample.now),
      isCorrect: result.isCorrect,
      timeout: result.timeout,
      frameStats: {
        fps: result.stats.fps,
        droppedFrames: result.stats.droppedFrames,
        jitter: result.stats.jitter,
      },
    };
  }

  function runAgain() {
    runState = 'ready';
    void startTrial();
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="webgl-container">
    <canvas bind:this={canvas} class="webgl-canvas"></canvas>

    {#if runState === 'running'}
      <div class="status-overlay">
        <p>Running trial...</p>
      </div>
    {/if}

    {#if runState === 'complete'}
      <div class="status-overlay">
        <p>{value?.timeout ? 'Timeout' : 'Complete'}</p>
        {#if value?.reactionTime > 0}
          <p class="rt">RT: {value.reactionTime.toFixed(0)}ms</p>
        {/if}
        <button class="restart" onclick={runAgain}>Run Again</button>
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .webgl-container {
    position: relative;
    width: 100%;
    height: 600px;
    background: #000;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .webgl-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .status-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    text-align: center;
  }

  .rt {
    margin-top: 0.4rem;
    font-size: 1.5rem;
    font-weight: 700;
    color: #4ade80;
  }

  .restart {
    margin-top: 1rem;
    padding: 0.55rem 1rem;
    border: 1px solid #60a5fa;
    border-radius: 0.4rem;
    background: transparent;
    color: #60a5fa;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .webgl-container {
      height: 400px;
    }
  }
</style>
