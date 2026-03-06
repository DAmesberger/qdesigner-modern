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

<div class="stats-feedback" data-testid="stats-feedback-root">
  <header class="header">
    <h3>{config.title}</h3>
    {#if config.subtitle}
      <p class="subtitle">{config.subtitle}</p>
    {/if}
    <p class="meta">
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
    <div class="chart-area" data-testid="stats-feedback-chart" data-chart-type={config.chartType}>
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
    <div class="summary" data-testid="stats-feedback-summary">
      {#each summaryEntries as entry}
        <div class="summary-item">
          <span class="summary-label">{entry.label}</span>
          <strong>{formatValue(entry.value)}</strong>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Score Interpretations -->
  {#if scoreInterpretation && scoreInterpretation.interpretations.length > 0}
    <div class="interpretations" data-testid="stats-feedback-interpretations">
      {#each scoreInterpretation.interpretations as interp}
        <div class="interpretation-card" data-testid={`interpretation-${interp.config.scaleName}`}>
          <div class="interp-header">
            <span class="interp-scale">{interp.config.scaleName}</span>
            <span class="interp-score">{Number.isFinite(interp.score) ? interp.score.toFixed(2) : 'N/A'}</span>
          </div>
          {#if interp.range}
            <div class="interp-badge" style="background-color: {interp.range.color}; color: white;">
              {interp.range.label}
            </div>
            <p class="interp-description">{interp.range.description}</p>
          {:else}
            <div class="interp-badge no-match">No classification</div>
          {/if}
          {#if interp.config.ranges.length > 0}
            <div class="interp-range-bar">
              {#each interp.config.ranges as range}
                {@const totalSpan = Math.max(...interp.config.ranges.map(r => r.max)) - Math.min(...interp.config.ranges.map(r => r.min))}
                {@const width = totalSpan > 0 ? ((range.max - range.min) / totalSpan) * 100 : 100 / interp.config.ranges.length}
                <div
                  class="interp-range-segment"
                  style="width: {width}%; background-color: {range.color};"
                  title="{range.label}: {range.min}-{range.max}"
                ></div>
              {/each}
              <!-- Score marker on range bar -->
              {#if Number.isFinite(interp.score)}
                {@const totalMin = Math.min(...interp.config.ranges.map(r => r.min))}
                {@const totalMax = Math.max(...interp.config.ranges.map(r => r.max))}
                {@const markerPos = totalMax > totalMin ? ((interp.score - totalMin) / (totalMax - totalMin)) * 100 : 50}
                <div class="range-marker" style="left: {Math.max(0, Math.min(100, markerPos))}%;">
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
    <div class="report-download" data-testid="stats-feedback-download">
      <button
        type="button"
        class="download-button"
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
    display: grid;
    gap: 0.75rem;
    padding: 1.25rem;
    border-radius: 0.75rem;
    background: linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%);
    border: 1px solid hsl(var(--border));
    color: hsl(var(--foreground));
  }

  .header h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: hsl(var(--foreground));
  }

  .header .subtitle {
    margin: 0.15rem 0 0;
    color: hsl(var(--muted-foreground));
    font-size: 0.85rem;
  }

  .header .meta {
    margin: 0.25rem 0 0;
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    font-size: 0.72rem;
    color: hsl(var(--muted-foreground));
    text-transform: capitalize;
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

  .chart-area {
    min-height: 200px;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.5rem;
  }

  .summary-item {
    display: grid;
    gap: 0.1rem;
    padding: 0.5rem 0.65rem;
    border-radius: 0.5rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
  }

  .summary-label {
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
    font-weight: 500;
    text-transform: capitalize;
  }

  .summary-item strong {
    font-size: 0.88rem;
    color: hsl(var(--foreground));
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  }

  .interpretations {
    display: grid;
    gap: 0.5rem;
  }

  .interpretation-card {
    padding: 0.65rem 0.8rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    display: grid;
    gap: 0.35rem;
  }

  .interp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .interp-scale {
    font-size: 0.82rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .interp-score {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    font-size: 0.95rem;
    font-weight: 700;
    color: hsl(var(--foreground));
  }

  .interp-badge {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    width: fit-content;
  }

  .interp-badge.no-match {
    background: hsl(var(--border));
    color: hsl(var(--muted-foreground));
  }

  .interp-description {
    font-size: 0.78rem;
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .interp-range-bar {
    position: relative;
    display: flex;
    height: 6px;
    border-radius: 999px;
    overflow: visible;
    margin-top: 0.35rem;
  }

  .interp-range-segment {
    opacity: 0.75;
    border-radius: 1px;
  }

  .interp-range-segment:first-child {
    border-radius: 999px 0 0 999px;
  }

  .interp-range-segment:last-child {
    border-radius: 0 999px 999px 0;
  }

  .range-marker {
    position: absolute;
    top: -5px;
    transform: translateX(-50%);
    z-index: 1;
  }

  .marker-arrow {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 7px solid hsl(var(--foreground));
  }

  .report-download {
    display: flex;
    justify-content: center;
    margin-top: 0.25rem;
  }

  .download-button {
    padding: 0.5rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--primary));
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .download-button:hover:not(:disabled) {
    background: hsl(var(--primary));
  }

  .download-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
