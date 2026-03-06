<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import { ReactionEngine } from '$lib/runtime/reaction';
  import type {
    ReactionTrialResult,
  } from '$lib/runtime/reaction';
  import { normalizeReactionQuestionConfig } from './model/reaction-normalize';
  import { compileReactionPlan } from './model/reaction-compiler';
  import type { PlannedReactionTrial } from './model/reaction-plan-types';
  import type { ReactionTaskType } from './model/reaction-schema';

  interface ReactionTimeConfig {
    stimulus: {
      type: 'text' | 'shape' | 'image';
      content: string;
      fixation?: {
        type: 'cross' | 'dot';
        duration: number;
      };
    };
    response: {
      validKeys: string[];
      timeout: number;
      requireCorrect?: boolean;
    };
    correctKey?: string;
    feedback?: boolean;
    practice?: boolean;
    practiceTrials?: number;
    testTrials?: number;
    targetFPS?: number;
    prompt?: string;
  }

  type PlannedTrial = PlannedReactionTrial;

  interface TrialRecord {
    trialId: string;
    trialNumber: number;
    isPractice: boolean;
    taskType: ReactionTaskType;
    blockId: string;
    condition: string | null;
    trialTemplateId: string | null;
    expectedResponse: string | null;
    isTarget: boolean | null;
    key: string | null;
    reactionTime: number | null;
    isCorrect: boolean | null;
    timeout: boolean;
    stimulusOnsetTime: number | null;
    responseTimingMethod: string | null;
    stimulusTimingMethod: string | null;
    frameStats: {
      fps: number;
      droppedFrames: number;
      jitter: number;
    };
  }

  interface ReactionTimeValue {
    responses: TrialRecord[];
    averageRT: number | null;
    accuracy: number | null;
    timeouts: number;
  }

  interface Props extends Omit<QuestionProps, 'question'> {
    question: any;
  }

  let {
    question = $bindable(),
    mode = 'runtime',
    value = $bindable(null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  const config = $derived((question.config || {}) as ReactionTimeConfig);
  const validKeys = $derived(config.response?.validKeys || ['f', 'j']);
  const showFeedback = $derived(config.feedback !== false);

  let canvas: HTMLCanvasElement | undefined = $state(undefined);
  let engine: ReactionEngine | null = $state(null);
  let phase: 'ready' | 'running' | 'feedback' | 'complete' = $state('ready');
  let feedbackText = $state('');
  let feedbackColor = $state('#4ade80');
  let currentTrial = $state(0);
  let totalTrials = $state(0);
  let abortController: AbortController | null = $state(null);

  $effect(() => {
    if (!value) {
      value = {
        responses: [],
        averageRT: null,
        accuracy: null,
        timeouts: 0,
      } satisfies ReactionTimeValue;
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      if (disabled || phase !== 'ready') return;
      event.preventDefault();
      void startTask();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  async function startTask() {
    if (!engine || disabled) return;

    abortController?.abort();
    abortController = new AbortController();

    phase = 'running';
    currentTrial = 0;

    const trialPlan = buildTrialPlan();
    totalTrials = trialPlan.length;

    const responses: TrialRecord[] = [];

    onInteraction?.({
      type: 'start' as any,
      timestamp: Date.now(),
      data: {
        totalTrials,
        targetFPS: config.targetFPS || 120,
        taskType: trialPlan[0]?.metadata.taskType || 'standard',
      },
    });

    for (let index = 0; index < trialPlan.length; index++) {
      const planned = trialPlan[index]!;
      currentTrial = index + 1;
      let result: ReactionTrialResult;
      try {
        result = await engine.runTrial(planned.trial, abortController.signal);
      } catch (error) {
        if (isAbortError(error)) {
          phase = 'ready';
          return;
        }
        throw error;
      }

      const trialRecord = mapResultToRecord(result, index + 1, planned);
      responses.push(trialRecord);

      onInteraction?.({
        type: 'trial-complete' as any,
        timestamp: Date.now(),
        data: {
          trialNumber: index + 1,
          isPractice: planned.metadata.isPractice,
          taskType: planned.metadata.taskType,
          reactionTime: trialRecord.reactionTime,
          timeout: trialRecord.timeout,
          blockId: planned.metadata.blockId,
          condition: planned.metadata.condition,
        },
      });

      if (showFeedback) {
        await showTrialFeedback(trialRecord);
      }
    }

    const computedValue = computeResultValue(responses);
    value = computedValue;
    onResponse?.(computedValue);

    onValidation?.({
      valid: responses.some((response) => !response.timeout),
      errors: responses.every((response) => response.timeout)
        ? ['No valid responses captured']
        : [],
    });

    phase = 'complete';

    onInteraction?.({
      type: 'complete' as any,
      timestamp: Date.now(),
      data: {
        averageRT: computedValue.averageRT,
        accuracy: computedValue.accuracy,
      },
    });
  }

  function buildTrialPlan(): PlannedTrial[] {
    const normalized = normalizeReactionQuestionConfig(question);
    return compileReactionPlan(normalized, {
      question,
      questionnaire: undefined,
    });
  }

  function mapResultToRecord(
    result: ReactionTrialResult,
    trialNumber: number,
    planned: PlannedTrial
  ): TrialRecord {
    const key =
      result.response && typeof result.response.value === 'string' ? result.response.value : null;

    return {
      trialId: planned.trial.id,
      trialNumber,
      isPractice: planned.metadata.isPractice,
      taskType: planned.metadata.taskType,
      blockId: planned.metadata.blockId,
      condition: planned.metadata.condition || null,
      trialTemplateId: planned.metadata.trialTemplateId || null,
      expectedResponse: planned.metadata.expectedResponse || null,
      isTarget: planned.metadata.isTarget ?? null,
      key,
      reactionTime: result.response?.reactionTimeMs ?? null,
      isCorrect: result.isCorrect,
      timeout: result.timeout,
      stimulusOnsetTime: result.stimulusOnsetTime,
      responseTimingMethod: result.response?.timingMethod || null,
      stimulusTimingMethod: result.stimulusTimingMethod || null,
      frameStats: {
        fps: result.stats.fps,
        droppedFrames: result.stats.droppedFrames,
        jitter: result.stats.jitter,
      },
    };
  }

  async function showTrialFeedback(trial: TrialRecord): Promise<void> {
    phase = 'feedback';

    if (trial.timeout) {
      feedbackText = 'Too slow';
      feedbackColor = '#f87171';
    } else if (trial.isCorrect === false) {
      feedbackText = `${trial.reactionTime?.toFixed(0) || '-'}ms (incorrect)`;
      feedbackColor = '#f97316';
    } else {
      feedbackText = `${trial.reactionTime?.toFixed(0) || '-'}ms`;
      feedbackColor = '#4ade80';
    }

    await delay(650);
    phase = 'running';
  }

  function computeResultValue(responses: TrialRecord[]): ReactionTimeValue {
    const testResponses = responses.filter((response) => !response.isPractice);
    const validRT = testResponses
      .map((response) => response.reactionTime)
      .filter((value): value is number => typeof value === 'number' && value > 0);

    const averageRT =
      validRT.length > 0
        ? validRT.reduce((sum, current) => sum + current, 0) / validRT.length
        : null;

    const correctness = testResponses.filter((response) => response.isCorrect !== null);
    const accuracy =
      correctness.length > 0
        ? correctness.filter((response) => response.isCorrect).length / correctness.length
        : null;

    return {
      responses,
      averageRT,
      accuracy,
      timeouts: testResponses.filter((response) => response.timeout).length,
    };
  }

  function resetTask() {
    abortController?.abort();
    phase = 'ready';
    currentTrial = 0;
    totalTrials = 0;
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="reaction-container">
    <canvas bind:this={canvas} class="reaction-canvas"></canvas>

    {#if phase === 'ready'}
      <div class="overlay-instructions">
        <h3>Reaction Time Task</h3>
        <p>{config.prompt || 'Respond as quickly as possible when the stimulus appears.'}</p>
        <p class="keys">Valid keys: {validKeys.join(', ').toUpperCase()}</p>
        <p class="start">Press SPACE to begin</p>
      </div>
    {/if}

    {#if phase === 'running'}
      <div class="status-overlay">
        <p>Trial {currentTrial} / {totalTrials}</p>
      </div>
    {/if}

    {#if phase === 'feedback'}
      <div class="status-overlay">
        <p class="feedback" style="color: {feedbackColor}">{feedbackText}</p>
      </div>
    {/if}

    {#if phase === 'complete'}
      <div class="overlay-instructions">
        <h3>Complete</h3>
        {#if value?.averageRT !== null}
          <p>Average RT: {value.averageRT.toFixed(1)} ms</p>
        {/if}
        {#if value?.accuracy !== null}
          <p>Accuracy: {(value.accuracy * 100).toFixed(1)}%</p>
        {/if}
        <button class="restart" onclick={resetTask}>Run Again</button>
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .reaction-container {
    position: relative;
    width: 100%;
    min-height: 420px;
    border-radius: 0.5rem;
    overflow: hidden;
    background: hsl(var(--foreground));
  }

  .reaction-canvas {
    display: block;
    width: 100%;
    height: 420px;
  }

  .overlay-instructions,
  .status-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: hsl(var(--background));
    background: hsl(var(--foreground) / 0.72);
    padding: 2rem;
  }

  .overlay-instructions h3 {
    margin: 0 0 0.75rem;
    font-size: 1.4rem;
  }

  .overlay-instructions p,
  .status-overlay p {
    margin: 0.4rem 0;
  }

  .keys {
    color: hsl(var(--primary) / 0.7);
    font-family: monospace;
  }

  .start {
    color: hsl(var(--success, 160 84% 39%));
    font-weight: 600;
  }

  .feedback {
    font-size: 1.6rem;
    font-weight: 700;
  }

  .restart {
    margin-top: 1rem;
    padding: 0.55rem 1rem;
    border: 1px solid hsl(var(--success, 160 84% 39%));
    background: transparent;
    color: hsl(var(--success, 160 84% 39%));
    border-radius: 0.4rem;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .reaction-container {
      min-height: 320px;
    }

    .reaction-canvas {
      height: 320px;
    }

    .overlay-instructions,
    .status-overlay {
      padding: 1rem;
    }
  }
</style>
