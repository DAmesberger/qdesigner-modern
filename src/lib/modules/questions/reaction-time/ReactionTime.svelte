<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import { ReactionEngine, createNBackTrials } from '$lib/runtime/reaction';
  import type {
    ReactionStimulusConfig,
    ReactionTrialConfig,
    ReactionTrialResult,
  } from '$lib/runtime/reaction';

  type ReactionTaskType = 'standard' | 'n-back' | 'custom';

  interface ReactionTimeConfig {
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

  interface PlannedTrial {
    trial: ReactionTrialConfig;
    isPractice: boolean;
    taskType: ReactionTaskType;
  }

  interface TrialRecord {
    trialNumber: number;
    isPractice: boolean;
    taskType: ReactionTaskType;
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
  const usePractice = $derived(Boolean(config.practice));
  const practiceTrials = $derived(config.practiceTrials || 3);
  const testTrials = $derived(config.testTrials || 10);

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
        taskType: config.task?.type || 'standard',
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
          isPractice: planned.isPractice,
          taskType: planned.taskType,
          reactionTime: trialRecord.reactionTime,
          timeout: trialRecord.timeout,
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
    const taskType: ReactionTaskType = config.task?.type || 'standard';

    if (taskType === 'n-back') {
      return buildNBackPlan();
    }

    if (taskType === 'custom') {
      const custom = buildCustomPlan();
      if (custom.length > 0) {
        return custom;
      }
    }

    return buildStandardPlan();
  }

  function buildStandardPlan(): PlannedTrial[] {
    const plan: PlannedTrial[] = [];
    const practiceCount = usePractice ? practiceTrials : 0;
    const total = practiceCount + testTrials;

    for (let index = 0; index < total; index++) {
      const isPractice = index < practiceCount;
      plan.push({
        trial: buildStandardTrialConfig(index + 1, isPractice),
        isPractice,
        taskType: 'standard',
      });
    }

    return plan;
  }

  function buildNBackPlan(): PlannedTrial[] {
    const nBack = config.task?.nBack;
    const n = Math.max(1, nBack?.n || 2);
    const sequenceLength = Math.max(3, nBack?.sequenceLength || testTrials || 20);
    const targetRate = Math.min(1, Math.max(0, nBack?.targetRate ?? 0.3));
    const stimulusSet = toNBackStimuli(nBack?.stimulusSet || ['A', 'B', 'C', 'D']);
    const targetKey = nBack?.targetKey || validKeys[0] || 'j';
    const nonTargetKey = nBack?.nonTargetKey || validKeys[1] || validKeys[0] || 'f';
    const fixationMs = nBack?.fixationMs || 400;
    const responseTimeoutMs = nBack?.responseTimeoutMs || 1200;

    const practiceCount = usePractice ? practiceTrials : 0;
    const practiceLength = Math.max(n + 2, practiceCount);

    const practicePlan =
      practiceCount > 0
        ? createNBackTrials({
            n,
            sequenceLength: practiceLength,
            targetRate,
            stimulusSet,
            validKeys,
            targetKey,
            nonTargetKey,
            fixationMs,
            responseTimeoutMs,
            targetFPS: config.targetFPS || 120,
            seed: `${question.id}:nback:practice`,
          }).slice(0, practiceCount)
        : [];

    const mainPlan = createNBackTrials({
      n,
      sequenceLength,
      targetRate,
      stimulusSet,
      validKeys,
      targetKey,
      nonTargetKey,
      fixationMs,
      responseTimeoutMs,
      targetFPS: config.targetFPS || 120,
      seed: `${question.id}:nback:test`,
    });

    return [
      ...practicePlan.map((trial) => ({ trial, isPractice: true, taskType: 'n-back' as const })),
      ...mainPlan.map((trial) => ({ trial, isPractice: false, taskType: 'n-back' as const })),
    ];
  }

  function buildCustomPlan(): PlannedTrial[] {
    const customTrials = config.task?.customTrials || [];
    const plan: PlannedTrial[] = [];

    customTrials.forEach((candidate, index) => {
      const trial = normalizeCustomTrial(candidate, index + 1);
      if (!trial) return;

      plan.push({
        trial,
        isPractice: Boolean(candidate.isPractice),
        taskType: 'custom',
      });
    });

    return plan;
  }

  function buildStandardTrialConfig(trialNumber: number, isPractice: boolean): ReactionTrialConfig {
    const stimulusType = config.stimulus?.type || 'shape';
    const stimulusContent = config.stimulus?.content || 'circle';

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
              radiusPx: 84,
            };

    return {
      id: `${question.id}-trial-${trialNumber}`,
      responseMode: 'keyboard',
      validKeys,
      correctResponse: config.correctKey,
      requireCorrect: config.response?.requireCorrect,
      fixation: {
        enabled: true,
        type: config.stimulus?.fixation?.type || 'cross',
        durationMs: config.stimulus?.fixation?.duration || 500,
      },
      stimulus,
      responseTimeoutMs: config.response?.timeout || 2000,
      targetFPS: config.targetFPS || 120,
      interTrialIntervalMs: isPractice ? 250 : 400,
    };
  }

  function normalizeCustomTrial(
    trial: Partial<ReactionTrialConfig> & {
      stimulus?: ReactionStimulusConfig | string;
    },
    trialNumber: number
  ): ReactionTrialConfig | null {
    const stimulus = normalizeStimulusCandidate(trial.stimulus);
    if (!stimulus) return null;

    return {
      id: trial.id || `${question.id}-custom-${trialNumber}`,
      responseMode: trial.responseMode || 'keyboard',
      validKeys: trial.validKeys || validKeys,
      correctResponse: trial.correctResponse,
      requireCorrect: trial.requireCorrect ?? config.response?.requireCorrect,
      fixation: {
        enabled: trial.fixation?.enabled ?? true,
        type: trial.fixation?.type || config.stimulus?.fixation?.type || 'cross',
        durationMs: trial.fixation?.durationMs ?? (config.stimulus?.fixation?.duration || 500),
      },
      preStimulusDelayMs: trial.preStimulusDelayMs,
      stimulus,
      stimulusDurationMs: trial.stimulusDurationMs,
      responseTimeoutMs: trial.responseTimeoutMs ?? (config.response?.timeout || 2000),
      interTrialIntervalMs: trial.interTrialIntervalMs ?? 300,
      targetFPS: trial.targetFPS ?? (config.targetFPS || 120),
      vsync: trial.vsync,
      backgroundColor: trial.backgroundColor,
      allowResponseDuringPreStimulus: trial.allowResponseDuringPreStimulus,
    };
  }

  function normalizeStimulusCandidate(
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

  function toNBackStimuli(stimulusSet: Array<string | ReactionStimulusConfig>): ReactionStimulusConfig[] {
    const mapped = stimulusSet.map((stimulus) => {
      if (typeof stimulus === 'string') {
        return {
          kind: 'text' as const,
          text: stimulus,
          fontPx: 72,
        };
      }
      return stimulus;
    });

    return mapped.length
      ? mapped
      : [
          { kind: 'text', text: 'A', fontPx: 72 },
          { kind: 'text', text: 'B', fontPx: 72 },
          { kind: 'text', text: 'C', fontPx: 72 },
          { kind: 'text', text: 'D', fontPx: 72 },
        ];
  }

  function mapResultToRecord(
    result: ReactionTrialResult,
    trialNumber: number,
    planned: PlannedTrial
  ): TrialRecord {
    const key =
      result.response && typeof result.response.value === 'string' ? result.response.value : null;

    return {
      trialNumber,
      isPractice: planned.isPractice,
      taskType: planned.taskType,
      key,
      reactionTime: result.response?.reactionTimeMs ?? null,
      isCorrect: result.isCorrect,
      timeout: result.timeout,
      stimulusOnsetTime: result.stimulusOnsetTime,
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
    background: #000;
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
    color: #fff;
    background: rgba(0, 0, 0, 0.72);
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
    color: #93c5fd;
    font-family: monospace;
  }

  .start {
    color: #4ade80;
    font-weight: 600;
  }

  .feedback {
    font-size: 1.6rem;
    font-weight: 700;
  }

  .restart {
    margin-top: 1rem;
    padding: 0.55rem 1rem;
    border: 1px solid #4ade80;
    background: transparent;
    color: #4ade80;
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
