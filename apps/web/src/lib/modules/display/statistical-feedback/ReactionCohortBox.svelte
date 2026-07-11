<!--
  Offline participant-vs-cohort REACTION box (RT-5 / ADR 0028).

  Cohort whiskers come from a PRE-SYNCED trial aggregate — the object bundle a
  `source: 'trials'` server-computed variable already injected into the
  VariableEngine (resolved offline, no network). The participant's own dot is
  computed from their LOCAL `filloutTrials` rows for the same question. Nothing on
  this render path touches the network.

  belowFloor: 'hide' → the widget renders nothing; 'placeholder' → a
  "cohort still forming — n=X of minN" note. The cohort n is always disclosed.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import FeedbackChart from './charts/FeedbackChart.svelte';
  import {
    buildReactionCohortBox,
    type LocalTrial,
    type ReactionCohort,
    type ReactionBoxResult,
  } from './reactionBox';
  import type { ChartSeriesContract } from '$lib/services/sessionAnalytics';

  interface Props {
    /**
     * The trial-cohort object bundle resolved from the server-computed variable
     * (e.g. `variables['cohortRt']`). `{ n, min, p25, median, p75, max, minN,
     * belowFloor, computedAt }`.
     */
    cohortBundle?: unknown;
    /** Reaction question id whose local trials form the participant's own stat. */
    questionId: string;
    /** Session whose local trials to read (omit when `participantTrials` is injected). */
    sessionId?: string;
    stat?: 'mean' | 'median';
    metric?: 'rt' | 'accuracy';
    includeInvalidated?: boolean;
    /** Axis / score label. */
    label?: string;
    height?: number;
    /**
     * Test / SSR seam: when provided, these local trials are used verbatim instead
     * of reading Dexie — the component then renders fully offline from fixtures.
     */
    participantTrials?: ReadonlyArray<LocalTrial>;
  }

  let {
    cohortBundle,
    questionId,
    sessionId,
    stat = 'median',
    metric = 'rt',
    includeInvalidated = false,
    label,
    height = 200,
    participantTrials,
  }: Props = $props();

  let localTrials = $state<ReadonlyArray<LocalTrial>>([]);

  onMount(async () => {
    if (participantTrials) {
      localTrials = participantTrials; // fixtures injected — no Dexie read.
      return;
    }
    if (!sessionId) return;
    try {
      const { OfflineTrialPersistence } = await import(
        '$lib/fillout/services/OfflineTrialPersistence'
      );
      localTrials = await OfflineTrialPersistence.getTrialMeasurements(sessionId, questionId);
    } catch (err) {
      console.error('[reaction-box] failed to read local trials:', err);
    }
  });

  /** Narrow the injected object bundle into a {@link ReactionCohort}, or null. */
  function toCohort(bundle: unknown): ReactionCohort | null {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return null;
    const b = bundle as Record<string, unknown>;
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    return {
      n: num(b.n) ?? 0,
      min: num(b.min),
      p25: num(b.p25),
      median: num(b.median),
      p75: num(b.p75),
      max: num(b.max),
      minN: num(b.minN) ?? 5,
      belowFloor: b.belowFloor === 'placeholder' ? 'placeholder' : 'hide',
      computedAt: typeof b.computedAt === 'string' ? b.computedAt : null,
    };
  }

  const result = $derived<ReactionBoxResult>(
    buildReactionCohortBox({
      cohort: toCohort(cohortBundle),
      participantTrials: localTrials,
      stat,
      metric,
      includeInvalidated,
    }),
  );

  const scoreName = $derived(label ?? (metric === 'accuracy' ? 'Accuracy' : 'Reaction time (ms)'));

  // A minimal series for the box chart — the box itself renders from `boxStats`.
  const chartSeries = $derived<ChartSeriesContract>(
    result.kind === 'chart'
      ? {
          mode: 'participant-vs-cohort',
          metric: 'median',
          points: [{ label: 'Cohort', value: result.box.median }],
          summary: { participantValue: result.participantValue, cohortN: result.n },
        }
      : { mode: 'participant-vs-cohort', metric: 'median', points: [] },
  );
</script>

{#if result.kind === 'chart'}
  <div class="reaction-box" data-testid="reaction-cohort-box">
    <FeedbackChart
      series={chartSeries}
      chartType="box"
      {scoreName}
      {height}
      boxStats={result.box}
      markerValue={result.participantValue}
    />
    <p class="caption" data-testid="reaction-cohort-caption">
      {result.caption}{#if result.participantValue !== null}
        · you: {result.participantValue.toFixed(metric === 'accuracy' ? 2 : 0)}{result.unit === 'ms'
          ? ' ms'
          : ''}{/if}
    </p>
  </div>
{:else if result.kind === 'placeholder'}
  <div class="reaction-box placeholder" data-testid="reaction-cohort-placeholder">
    <p>{result.message}</p>
  </div>
{/if}

<style>
  .reaction-box {
    width: 100%;
  }

  .caption {
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
    margin: 0.25rem 0 0;
    text-align: center;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    padding: 1rem;
    border: 1px dashed hsl(var(--border));
    border-radius: 0.75rem;
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    text-align: center;
  }
</style>
