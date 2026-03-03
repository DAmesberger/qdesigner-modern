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

  const maxMagnitude = $derived.by(() => {
    const values = (series?.points || [])
      .map((point) => point.value)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (values.length === 0) {
      return 1;
    }

    const max = Math.max(...values.map((value) => Math.abs(value)));
    return max > 0 ? max : 1;
  });

  function formatValue(value: number | null): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return 'N/A';
    }

    if (Math.abs(value) >= 1000) {
      return value.toFixed(1);
    }

    if (Math.abs(value) >= 100) {
      return value.toFixed(2);
    }

    return value.toFixed(3);
  }

  function barWidth(value: number | null): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '0%';
    }

    const width = Math.min(100, (Math.abs(value) / maxMagnitude) * 100);
    return `${width}%`;
  }

  function isNegative(value: number | null): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value < 0;
  }

  const summaryEntries = $derived.by((): Array<{ label: string; value: number | null }> => {
    if (!series?.summary) {
      return [];
    }

    return Object.entries(series.summary).map(([label, value]) => ({
      label,
      value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    }));
  });

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
      <p>{config.subtitle}</p>
    {/if}
    <p class="meta">Mode: {config.sourceMode} | Metric: {config.metric}</p>
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

  {#if series}
    <div class="chart" data-testid="stats-feedback-chart" data-chart-type={config.chartType}>
      {#each series.points as point (point.label)}
        <div class="row" data-testid={`stats-point-${point.label}`}>
          <div class="label">{point.label}</div>
          <div class="track">
            <div
              class="bar"
              class:negative={isNegative(point.value)}
              style={`width: ${barWidth(point.value)}`}
            ></div>
          </div>
          <div class="value">{formatValue(point.value)}</div>
        </div>
      {/each}
    </div>

    {#if config.showSummary && summaryEntries.length > 0}
      <div class="summary" data-testid="stats-feedback-summary">
        {#each summaryEntries as entry}
          <div class="summary-item">
            <span>{entry.label}</span>
            <strong>{formatValue(entry.value)}</strong>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if scoreInterpretation && scoreInterpretation.interpretations.length > 0}
    <div class="interpretations" data-testid="stats-feedback-interpretations">
      {#each scoreInterpretation.interpretations as interp}
        <div class="interpretation-card" data-testid={`interpretation-${interp.config.scaleName}`}>
          <div class="interp-header">
            <span class="interp-scale">{interp.config.scaleName}</span>
            <span class="interp-score">{Number.isFinite(interp.score) ? interp.score.toFixed(2) : 'N/A'}</span>
          </div>
          {#if interp.range}
            <div class="interp-badge" style="background-color: {interp.range.color}; color: #fff;">
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
    padding: 1rem;
    border-radius: 0.75rem;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid #dbe3ed;
    color: #0f172a;
  }

  .header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .header p {
    margin: 0.1rem 0 0;
    color: #475569;
    font-size: 0.85rem;
  }

  .header .meta {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    font-size: 0.75rem;
    color: #64748b;
  }

  .state {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: #eef2ff;
    color: #3730a3;
    font-size: 0.82rem;
  }

  .state.warning {
    background: #fef3c7;
    color: #92400e;
  }

  .state.error {
    background: #fee2e2;
    color: #991b1b;
  }

  .chart {
    display: grid;
    gap: 0.5rem;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(90px, 1fr) minmax(120px, 3fr) auto;
    align-items: center;
    gap: 0.5rem;
  }

  .label,
  .value {
    font-size: 0.8rem;
    color: #334155;
  }

  .value {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    justify-self: end;
  }

  .track {
    height: 0.6rem;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
    position: relative;
  }

  .bar {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%);
    transition: width 0.2s ease;
  }

  .bar.negative {
    background: linear-gradient(90deg, #ef4444 0%, #f97316 100%);
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.5rem;
  }

  .summary-item {
    display: grid;
    gap: 0.1rem;
    padding: 0.45rem 0.6rem;
    border-radius: 0.45rem;
    background: #eef2ff;
    font-size: 0.75rem;
    color: #334155;
  }

  .summary-item strong {
    font-size: 0.83rem;
    color: #0f172a;
  }

  .interpretations {
    display: grid;
    gap: 0.5rem;
  }

  .interpretation-card {
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid #e2e8f0;
    background: #fff;
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
    color: #0f172a;
  }

  .interp-score {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    font-size: 0.9rem;
    font-weight: 700;
    color: #0f172a;
  }

  .interp-badge {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    width: fit-content;
  }

  .interp-badge.no-match {
    background: #e2e8f0;
    color: #64748b;
  }

  .interp-description {
    font-size: 0.78rem;
    color: #475569;
    margin: 0;
  }

  .interp-range-bar {
    display: flex;
    height: 0.4rem;
    border-radius: 999px;
    overflow: hidden;
    margin-top: 0.2rem;
  }

  .interp-range-segment {
    opacity: 0.7;
  }

  .report-download {
    display: flex;
    justify-content: center;
    margin-top: 0.25rem;
  }

  .download-button {
    padding: 0.5rem 1rem;
    border-radius: 0.45rem;
    border: 1px solid #2563eb;
    background: #2563eb;
    color: #fff;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .download-button:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .download-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
