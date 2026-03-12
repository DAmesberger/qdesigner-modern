<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import { ReactionEngine } from '$lib/runtime/reaction';
  import type { ReactionTrialResult } from '$lib/runtime/reaction';
  import {
    compileReactionExperimentPlan,
    normalizeReactionExperimentConfig,
  } from './model/reaction-experiment';

  interface TrialRecord {
    trialId: string;
    trialNumber: number;
    blockId: string;
    condition: string | null;
    reactionTime: number | null;
    isCorrect: boolean | null;
    timeout: boolean;
  }

  interface ReactionExperimentValue {
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
    value = $bindable(),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  const config = $derived(normalizeReactionExperimentConfig(question));
  const validKeys = $derived(config.response.validKeys);
  const showFeedback = $derived(config.feedback.enabled);

  let canvas: HTMLCanvasElement | undefined = $state(undefined);
  let engine: ReactionEngine | null = $state(null);
  let phase: 'ready' | 'running' | 'feedback' | 'complete' = $state('ready');
  let currentTrial = $state(0);
  let totalTrials = $state(0);
  let abortController: AbortController | null = $state(null);
  let feedbackText = $state('');
  let feedbackColor = $state('#4ade80');

  $effect(() => {
    if (!value) {
      value = {
        responses: [],
        averageRT: null,
        accuracy: null,
        timeouts: 0,
      } satisfies ReactionExperimentValue;
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
    const activeEngine = engine;
    if (!activeEngine || disabled) return;

    abortController?.abort();
    abortController = new AbortController();
    phase = 'running';

    const plan = compileReactionExperimentPlan(config, {
      questionnaire: undefined,
      question,
      variableEngine: {
        getVariable() {
          return config.randomization.previewParticipantId;
        },
      } as any,
    });

    totalTrials = plan.length;
    const responses: TrialRecord[] = [];

    for (let index = 0; index < plan.length; index++) {
      const planned = plan[index]!;
      currentTrial = index + 1;

      let result: ReactionTrialResult;
      try {
        activeEngine.clearScheduledPhases();
        (planned.metadata.scheduledPhases || []).forEach((scheduledPhase) =>
          activeEngine.schedulePhase(scheduledPhase)
        );
        result = await activeEngine.runTrial(planned.trial, abortController.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          phase = 'ready';
          return;
        }
        throw error;
      }

      responses.push({
        trialId: planned.trial.id,
        trialNumber: index + 1,
        blockId: planned.metadata.blockId,
        condition: planned.metadata.condition || null,
        reactionTime: result.response?.reactionTimeMs ?? null,
        isCorrect: result.isCorrect,
        timeout: result.timeout,
      });

      if (showFeedback) {
        await showTrialFeedback(result);
      }
    }

    const validRts = responses
      .map((response) => response.reactionTime)
      .filter((entry): entry is number => typeof entry === 'number' && entry > 0);
    const averageRT =
      validRts.length > 0
        ? validRts.reduce((total, entry) => total + entry, 0) / validRts.length
        : null;
    const correctness = responses.filter((response) => response.isCorrect !== null);
    const accuracy =
      correctness.length > 0
        ? correctness.filter((response) => response.isCorrect).length / correctness.length
        : null;

    value = {
      responses,
      averageRT,
      accuracy,
      timeouts: responses.filter((response) => response.timeout).length,
    } satisfies ReactionExperimentValue;

    onResponse?.(value);
    onValidation?.({
      valid: responses.some((response) => !response.timeout),
      errors: responses.every((response) => response.timeout) ? ['No valid responses captured'] : [],
    });
    onInteraction?.({
      type: 'complete' as any,
      timestamp: Date.now(),
      data: {
        template: config.metadata.template,
        trialCount: responses.length,
      },
    });

    phase = 'complete';
  }

  function resetTask() {
    abortController?.abort();
    currentTrial = 0;
    totalTrials = 0;
    phase = 'ready';
  }

  async function showTrialFeedback(result: ReactionTrialResult) {
    phase = 'feedback';

    if (result.timeout) {
      feedbackText = 'Too slow';
      feedbackColor = '#f87171';
    } else if (result.isCorrect === false) {
      feedbackText = `${result.response?.reactionTimeMs?.toFixed(0) || '-'} ms (incorrect)`;
      feedbackColor = '#f97316';
    } else {
      feedbackText = `${result.response?.reactionTimeMs?.toFixed(0) || '-'} ms`;
      feedbackColor = '#4ade80';
    }

    await new Promise((resolve) => setTimeout(resolve, 650));
    phase = 'running';
  }
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="reaction-lab-runtime">
    <canvas bind:this={canvas} class="reaction-lab-canvas"></canvas>

    {#if phase === 'ready'}
      <div class="overlay">
        <div class="badge">{config.metadata.template}</div>
        <h3>{config.metadata.prompt}</h3>
        <p class="description">
          Press SPACE to run {config.blocks.length} block{config.blocks.length !== 1 ? 's' : ''}.
        </p>
        <p class="keys">Valid keys: {validKeys.join(', ').toUpperCase()}</p>
        {#if config.response.requireCorrect}
          <p class="keys">Correctness scoring enabled</p>
        {/if}
      </div>
    {:else if phase === 'running'}
      <div class="overlay compact">
        <p>Trial {currentTrial} / {totalTrials}</p>
      </div>
    {:else if phase === 'feedback'}
      <div class="overlay compact">
        <p class="feedback" style="color: {feedbackColor}">{feedbackText}</p>
      </div>
    {:else if phase === 'complete'}
      <div class="overlay">
        <h3>Experiment Complete</h3>
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
  .reaction-lab-runtime {
    position: relative;
    width: 100%;
    min-height: 480px;
    overflow: hidden;
    border-radius: 0.9rem;
    background:
      radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.18), transparent 32%),
      linear-gradient(160deg, #08121c, #0f2132);
  }

  .reaction-lab-canvas {
    width: 100%;
    height: 480px;
    display: block;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: white;
    background: rgba(4, 10, 20, 0.68);
    padding: 2rem;
  }

  .overlay.compact {
    background: rgba(4, 10, 20, 0.25);
  }

  .badge {
    margin-bottom: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .description {
    max-width: 30rem;
    color: rgba(255, 255, 255, 0.72);
  }

  .keys {
    margin-top: 0.75rem;
    font-family: monospace;
    color: rgba(125, 211, 252, 0.92);
  }

  .restart {
    margin-top: 1rem;
    padding: 0.65rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(125, 211, 252, 0.4);
    background: rgba(14, 165, 233, 0.16);
    color: white;
  }

  .feedback {
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
</style>
