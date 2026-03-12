<script lang="ts">
  import {
    normalizeStatisticalFeedbackConfig,
    resolveStatisticalFeedbackSeries,
    validateStatisticalFeedbackConfig,
    type StatisticalFeedbackConfig,
  } from './engine';
  import type { ChartSeriesContract } from '$lib/services/sessionAnalytics';
  import {
    interpretMultipleScales,
    type MultiScaleInterpretation,
  } from '$lib/runtime/feedback/ScoreInterpreter';
  import { generateReport, type ReportConfig } from '$lib/runtime/feedback/ReportGenerator';
  import BellCurveChart from './charts/BellCurveChart.svelte';
  import FeedbackChart from './charts/FeedbackChart.svelte';
  import GaugeChart from './charts/GaugeChart.svelte';
  import type { ColorRule } from './charts/chart-utils';

  interface Props {
    analytics?: any;
    block?: any;
    mode?: 'edit' | 'preview' | 'runtime';
    variables?: Record<string, unknown>;
  }

  let { analytics, block, mode = 'runtime', variables = {} }: Props = $props();

  const item = $derived(analytics || block);
  const config = $derived<StatisticalFeedbackConfig>(normalizeStatisticalFeedbackConfig(item));

  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let validationErrors = $state<string[]>([]);
  let series = $state<ChartSeriesContract | null>(null);
  let generatingReport = $state(false);

  // Score interpretations
  const scoreInterpretation = $derived.by((): MultiScaleInterpretation | null => {
    if (!config.scoreInterpretation || config.scoreInterpretation.length === 0) {
      return null;
    }
    return interpretMultipleScales(variables, config.scoreInterpretation);
  });

  async function loadSeries() {
    loading = true;
    loadError = null;

    try {
      series = await resolveStatisticalFeedbackSeries(config, variables);
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : 'Unable to load statistical feedback data';
      series = {
        mode: config.sourceMode,
        metric: config.metric,
        points: [{ label: 'No data', value: null }],
      };
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const currentConfig = config;
    validationErrors = validateStatisticalFeedbackConfig(currentConfig);

    void loadSeries();

    if (currentConfig.refreshMs <= 0 || mode === 'edit') {
      return;
    }

    const timer = window.setInterval(() => {
      void loadSeries();
    }, currentConfig.refreshMs);

    return () => {
      window.clearInterval(timer);
    };
  });

  // Derived values for chart rendering
  const participantValue = $derived.by((): number | null => {
    if (!series) return null;
    const pt = series.points.find((p) => p.label === 'Participant' || p.label === 'Current');
    return pt?.value ?? series.points[0]?.value ?? null;
  });

  const cohortMean = $derived(
    series?.summary?.cohortMean ?? series?.distribution?.mean ?? null,
  );

  const cohortStdDev = $derived(
    series?.summary?.cohortStdDev ?? series?.distribution?.stdDev ?? null,
  );

  const cohortN = $derived(
    series?.summary?.cohortN ?? series?.distribution?.n ?? null,
  );

  // For gauge: find score range from interpretation
  const gaugeRange = $derived.by((): { min: number; max: number; color: string | undefined } => {
    if (scoreInterpretation && scoreInterpretation.interpretations.length > 0) {
      const interp = scoreInterpretation.interpretations[0]!;
      const allRanges = interp.config.ranges;
      if (allRanges.length > 0) {
        return {
          min: Math.min(...allRanges.map((r) => r.min)),
          max: Math.max(...allRanges.map((r) => r.max)),
          color: interp.range?.color,
        };
      }
    }
    return { min: 0, max: 100, color: undefined };
  });

  // Derive color rules from the first score interpretation scale's ranges
  // ScoreInterpretationRange is structurally compatible with ColorRule
  const colorRules = $derived.by((): ColorRule[] => {
    if (!config.scoreInterpretation || config.scoreInterpretation.length === 0) {
      return [];
    }
    // Use all ranges from the first scale as chart color rules
    const firstScale = config.scoreInterpretation[0];
    if (!firstScale || firstScale.ranges.length === 0) return [];
    return firstScale.ranges.map((r) => ({
      min: r.min,
      max: r.max,
      color: r.color,
      label: r.label,
    }));
  });

  // Check if we should use Chart.js or the simple CSS bars
  const useChartJs = $derived(
    config.chartType !== undefined &&
      ['bar', 'line', 'radar', 'scatter', 'histogram', 'box', 'bell-curve', 'gauge'].includes(
        config.chartType,
      ),
  );

  const summaryEntries = $derived.by((): Array<{ label: string; value: number | null }> => {
    if (!series?.summary) {
      return [];
    }

    return Object.entries(series.summary)
      .filter(([key]) => !['cohortStdDev', 'cohortN'].includes(key))
      .map(([label, value]) => ({
        label: formatSummaryLabel(label),
        value: typeof value === 'number' && Number.isFinite(value) ? value : null,
      }));
  });

  function formatSummaryLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }

  function formatValue(value: number | null): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return 'N/A';
    }
    if (Math.abs(value) >= 1000) return value.toFixed(1);
    if (Math.abs(value) >= 100) return value.toFixed(2);
    return value.toFixed(3);
  }

  async function handleDownloadReport(): Promise<void> {
    if (generatingReport) return;
    generatingReport = true;
    try {
      const reportConfig: ReportConfig = {
        title: config.reportTitle || config.title,
        subtitle: config.subtitle || undefined,
        scoreConfigs: config.scoreInterpretation || [],
        includeChart: true,
      };
      await generateReport(reportConfig, { variables });
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      generatingReport = false;
    }
  }
</script>

<div class="stats-feedback grid gap-3 border border-border rounded-xl text-foreground" data-testid="stats-feedback-root">
  <header>
    <h3 class="m-0 text-foreground font-bold" style="font-size: 1.05rem">{config.title}</h3>
    {#if config.subtitle}
      <p class="text-muted-foreground mt-0.5 mb-0" style="font-size: 0.85rem">{config.subtitle}</p>
    {/if}
    <p class="mt-1 mb-0 font-mono text-muted-foreground capitalize" style="font-size: 0.72rem">
      {config.sourceMode.replace(/-/g, ' ')} &middot; {config.metric}
      {#if cohortN !== null}
        &middot; n = {cohortN}
      {/if}
    </p>
  </header>

  {#if validationErrors.length > 0 && mode !== 'runtime'}
    <div class="state warning" data-testid="stats-feedback-validation">
      {#each validationErrors as message}
        <p>{message}</p>
      {/each}
    </div>
  {/if}

  {#if loadError}
    <div class="state error" data-testid="stats-feedback-error">{loadError}</div>
  {/if}

  {#if loading && !series}
    <div class="state" data-testid="stats-feedback-loading">Loading statistical data...</div>
  {/if}

  <!-- Chart Rendering -->
  {#if series && useChartJs}
    <div class="min-h-[200px]" data-testid="stats-feedback-chart" data-chart-type={config.chartType}>
      {#if config.chartType === 'bell-curve'}
        <BellCurveChart
          participantValue={participantValue}
          mean={cohortMean ?? 0}
          stdDev={cohortStdDev ?? 1}
          scoreName={config.title}
          {colorRules}
        />
      {:else if config.chartType === 'gauge'}
        <GaugeChart
          value={participantValue}
          min={gaugeRange.min}
          max={gaugeRange.max}
          label={config.title}
          color={gaugeRange.color}
          {colorRules}
          cohortMean={cohortMean}
          cohortStdDev={cohortStdDev}
        />
      {:else}
        <FeedbackChart
          {series}
          chartType={config.chartType}
          scoreName={config.title}
          cohortMean={cohortMean}
          cohortStdDev={cohortStdDev}
          {colorRules}
        />
      {/if}
    </div>
  {/if}

  <!-- Summary Stats -->
  {#if series && config.showSummary && summaryEntries.length > 0}
    <div class="summary grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2" data-testid="stats-feedback-summary">
      {#each summaryEntries as entry}
        <div class="summary-item grid gap-px px-2.5 py-2 rounded-lg bg-muted border border-border" style="padding: 0.5rem 0.65rem">
          <span class="text-muted-foreground font-medium capitalize" style="font-size: 0.7rem">{entry.label}</span>
          <strong class="text-foreground font-mono" style="font-size: 0.88rem">{formatValue(entry.value)}</strong>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Score Interpretations -->
  {#if scoreInterpretation && scoreInterpretation.interpretations.length > 0}
    <div class="grid gap-2" data-testid="stats-feedback-interpretations">
      {#each scoreInterpretation.interpretations as interp}
        <div class="interpretation-card grid rounded-lg border border-border bg-card" style="padding: 0.65rem 0.8rem; gap: 0.35rem" data-testid={`interpretation-${interp.config.scaleName}`}>
          <div class="flex justify-between items-center">
            <span class="font-semibold text-foreground" style="font-size: 0.82rem">{interp.config.scaleName}</span>
            <span class="font-mono font-bold text-foreground" style="font-size: 0.95rem">{Number.isFinite(interp.score) ? interp.score.toFixed(2) : 'N/A'}</span>
          </div>
          {#if interp.range}
            <div class="interp-badge inline-block rounded-full font-semibold w-fit" style="padding: 0.15rem 0.6rem; font-size: 0.72rem; background-color: {interp.range.color}; color: white;">
              {interp.range.label}
            </div>
            <p class="text-muted-foreground m-0" style="font-size: 0.78rem">{interp.range.description}</p>
          {:else}
            <div class="interp-badge inline-block rounded-full font-semibold w-fit bg-border text-muted-foreground" style="padding: 0.15rem 0.6rem; font-size: 0.72rem">No classification</div>
          {/if}
          {#if interp.config.ranges.length > 0}
            <div class="interp-range-bar relative flex h-1.5 overflow-visible mt-1.5" style="border-radius: 999px">
              {#each interp.config.ranges as range}
                {@const totalSpan = Math.max(...interp.config.ranges.map(r => r.max)) - Math.min(...interp.config.ranges.map(r => r.min))}
                {@const width = totalSpan > 0 ? ((range.max - range.min) / totalSpan) * 100 : 100 / interp.config.ranges.length}
                <div
                  class="interp-range-segment opacity-75"
                  style="width: {width}%; background-color: {range.color}; border-radius: 1px"
                  title="{range.label}: {range.min}-{range.max}"
                ></div>
              {/each}
              <!-- Score marker on range bar -->
              {#if Number.isFinite(interp.score)}
                {@const totalMin = Math.min(...interp.config.ranges.map(r => r.min))}
                {@const totalMax = Math.max(...interp.config.ranges.map(r => r.max))}
                {@const markerPos = totalMax > totalMin ? ((interp.score - totalMin) / (totalMax - totalMin)) * 100 : 50}
                <div class="absolute -top-[5px] -translate-x-1/2 z-[1]" style="left: {Math.max(0, Math.min(100, markerPos))}%;">
                  <div class="marker-arrow"></div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if config.enableReportDownload && mode === 'runtime'}
    <div class="flex justify-center mt-1" data-testid="stats-feedback-download">
      <button
        type="button"
        class="download-button px-5 py-2 rounded-lg border border-primary bg-primary text-primary-foreground font-semibold cursor-pointer transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
        style="font-size: 0.82rem"
        disabled={generatingReport}
        onclick={handleDownloadReport}
      >
        {#if generatingReport}
          Generating...
        {:else}
          Download Report (PDF)
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  .stats-feedback {
    padding: 1.25rem;
    background: linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%);
  }

  .state {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    font-size: 0.82rem;
  }

  .state.warning {
    background: hsl(var(--warning) / 0.15);
    color: hsl(var(--warning));
  }

  .state.error {
    background: hsl(var(--destructive) / 0.15);
    color: hsl(var(--destructive));
  }

  .interp-range-segment:first-child {
    border-radius: 999px 0 0 999px;
  }

  .interp-range-segment:last-child {
    border-radius: 0 999px 999px 0;
  }

  .marker-arrow {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 7px solid hsl(var(--foreground));
  }
</style>
