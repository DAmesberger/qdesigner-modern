<!--
  E-FEEDBACK-3 participant-facing report page. A PURE CONSUMER: it composes
  typed widgets on a 12-column grid and reads every value straight out of the
  completed session's variables — no network on the render path. Its cohort
  widgets (`box-cohort`) bind an object-typed server-computed variable and route
  through the statistical-feedback engine's offline `server-variable` mode.

  Mounted by CompletionScreen OUTSIDE the runtime item loop (plain Svelte, no
  FormQuestionHost). WidgetPosition mirrors analytics/types/dashboard-builder.ts
  but is intentionally COPIED, not imported — the analytics dashboard is an
  authenticated online tool with a different lifecycle.
-->
<script lang="ts">
  import type {
    ReportPageConfig,
    ReportWidget,
  } from '@qdesigner/questionnaire-core';
  import type { QuestionnaireSession } from '$lib/shared';
  import {
    resolveStatisticalFeedbackSeries,
    defaultStatisticalFeedbackConfig,
    type StatisticalFeedbackConfig,
  } from '$lib/modules/display/statistical-feedback/engine';
  import type { ChartSeriesContract } from '$lib/services/sessionAnalytics';
  import FeedbackChart from '$lib/modules/display/statistical-feedback/charts/FeedbackChart.svelte';
  import GaugeChart from '$lib/modules/display/statistical-feedback/charts/GaugeChart.svelte';
  import ReactionCohortBox from '$lib/modules/display/statistical-feedback/ReactionCohortBox.svelte';
  import {
    interpretScore,
    type ScoreInterpreterConfig,
  } from '$lib/runtime/feedback/ScoreInterpreter';
  import { generateReport, type ReportConfig } from '$lib/runtime/feedback/ReportGenerator';
  import { interpolateVariables } from '$lib/services/variableInterpolation';

  interface Props {
    reportConfig: ReportPageConfig;
    /** Completed session variables (server values already injected). */
    variables?: Record<string, unknown>;
    /** Score interpretation scales — reused for tiles + the PDF export. */
    scoreConfigs?: ScoreInterpreterConfig[];
    session?: QuestionnaireSession;
    /** Report title override / PDF title. */
    reportTitle?: string;
  }

  let {
    reportConfig,
    variables = {},
    scoreConfigs = [],
    session,
    reportTitle,
  }: Props = $props();

  const columns = $derived(reportConfig.layout?.columns ?? 12);
  const rowHeight = $derived(reportConfig.layout?.rowHeight ?? 80);
  const gap = $derived(reportConfig.layout?.gap ?? 12);
  const widgets = $derived(reportConfig.widgets ?? []);

  let generatingReport = $state(false);

  // ---------------------------------------------------------------------------
  // Value resolution — a dotted-path walk over the live variables record. Mirrors
  // the engine's resolveVariableValue so `score.anxiety.value` and a flat object
  // key both resolve. Kept local so this component stays a pure consumer.
  // ---------------------------------------------------------------------------
  function resolveValue(path: string): unknown {
    const trimmed = path.trim();
    if (!trimmed) return undefined;
    if (Object.hasOwn(variables, trimmed)) return variables[trimmed];
    if (!trimmed.includes('.')) return variables[trimmed];

    const segments = trimmed.split('.').filter(Boolean);
    for (let prefix = segments.length - 1; prefix >= 1; prefix--) {
      const key = segments.slice(0, prefix).join('.');
      if (!Object.hasOwn(variables, key)) continue;
      let cursor: unknown = variables[key];
      for (const seg of segments.slice(prefix)) {
        if (!cursor || typeof cursor !== 'object') return undefined;
        const rec = cursor as Record<string, unknown>;
        if (!Object.hasOwn(rec, seg)) return undefined;
        cursor = rec[seg];
      }
      return cursor;
    }
    return undefined;
  }

  /** Resolve a widget binding to its dotted lookup key. */
  function bindingKey(widget: ReportWidget): string {
    const { source, key, field } = widget.binding;
    if (source === 'score') {
      return `score.${key}.${field ?? 'value'}`;
    }
    return field ? `${key}.${field}` : key;
  }

  function numericValue(widget: ReportWidget): number | null {
    const raw = resolveValue(bindingKey(widget));
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function formatNumber(value: number | null): string {
    if (value === null) return '—';
    if (Math.abs(value) >= 100) return value.toFixed(1);
    return value.toFixed(2);
  }

  // ---------------------------------------------------------------------------
  // Chart widgets — map a ReportWidget onto the statistical-feedback config and
  // resolve the series OFFLINE (server-variable / current-session / norm-table).
  // ---------------------------------------------------------------------------
  // Restricted to the Chart.js feedback chart's own type union (no gauge/bell).
  type FeedbackChartType = 'bar' | 'box' | 'radar' | 'histogram';
  const CHART_TYPE: Record<string, FeedbackChartType> = {
    bar: 'bar',
    'box-cohort': 'box',
    'radar-profile': 'radar',
    'distribution-with-marker': 'histogram',
  };

  function isChartWidget(widget: ReportWidget): boolean {
    return widget.type in CHART_TYPE;
  }

  function seriesConfig(widget: ReportWidget): StatisticalFeedbackConfig {
    const key = bindingKey(widget);
    const comparison = widget.comparison;

    let sourceMode: StatisticalFeedbackConfig['sourceMode'] = 'current-session';
    if (comparison?.source === 'server-variable') sourceMode = 'server-variable';
    else if (comparison?.source === 'norm-table' || comparison?.source === 'custom-norm')
      sourceMode = 'norm-table';
    else if (comparison?.source === 'self-baseline') sourceMode = 'self-baseline';

    return {
      ...defaultStatisticalFeedbackConfig,
      title: '',
      chartType: CHART_TYPE[widget.type] ?? 'bar',
      sourceMode,
      metric: 'mean',
      dataSource: {
        ...defaultStatisticalFeedbackConfig.dataSource,
        currentVariable: key,
        key,
        serverVariable: comparison?.serverVariable ?? '',
        normTableId: comparison?.normTableId ?? '',
        fallbackNormTableId: comparison?.fallbackNormTableId ?? '',
      },
    };
  }

  async function loadSeries(widget: ReportWidget): Promise<ChartSeriesContract> {
    return resolveStatisticalFeedbackSeries(seriesConfig(widget), variables, 'runtime');
  }

  // ---------------------------------------------------------------------------
  // Score-tile interpretation — reuse the ScoreInterpreter band, if a scale
  // matches this widget's binding.
  // ---------------------------------------------------------------------------
  function tileInterpretation(
    widget: ReportWidget
  ): { label: string; color: string } | null {
    const value = numericValue(widget);
    if (value === null) return null;
    const scaleId = widget.binding.key;
    const cfg = scoreConfigs.find(
      (c) => c.variableId === scaleId || c.variableId === bindingKey(widget)
    );
    if (!cfg) return null;
    const interp = interpretScore(value, cfg);
    return interp.range ? { label: interp.range.label, color: interp.range.color } : null;
  }

  function interpText(widget: ReportWidget): string {
    return interpolateVariables(widget.text ?? widget.interpretation ?? '', variables);
  }

  // ---------------------------------------------------------------------------
  // Completion-meta widget
  // ---------------------------------------------------------------------------
  const durationLabel = $derived.by(() => {
    if (!session?.startTime || !session?.endTime) return null;
    const ms = session.endTime - session.startTime;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  // ---------------------------------------------------------------------------
  // Results-table widget — flatten the bound value into label/value rows.
  // ---------------------------------------------------------------------------
  function tableRows(widget: ReportWidget): Array<{ label: string; value: string }> {
    const raw = resolveValue(bindingKey(widget));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({
        label: k,
        value: typeof v === 'number' ? formatNumber(v) : String(v ?? '—'),
      }));
    }
    return [
      {
        label: widget.binding.key,
        value: typeof raw === 'number' ? formatNumber(raw) : String(raw ?? '—'),
      },
    ];
  }

  function gridStyle(widget: ReportWidget): string {
    const { x, y, w, h } = widget.position;
    const col = Math.max(0, Math.min(columns - 1, x)) + 1;
    const span = Math.max(1, Math.min(columns, w));
    return `grid-column: ${col} / span ${span}; grid-row: ${y + 1} / span ${Math.max(1, h)};`;
  }

  const showPdf = $derived(reportConfig.enablePdfDownload && scoreConfigs.length > 0);

  async function handleDownload(): Promise<void> {
    if (generatingReport || scoreConfigs.length === 0) return;
    generatingReport = true;
    try {
      const config: ReportConfig = {
        title: reportTitle || reportConfig.title || 'Participant Report',
        participantId: session?.participantId ?? undefined,
        scoreConfigs,
        includeChart: true,
      };
      await generateReport(config, { variables });
    } catch (err) {
      console.error('Failed to generate report PDF:', err);
    } finally {
      generatingReport = false;
    }
  }
</script>

{#if reportConfig.enabled && widgets.length > 0}
  <section class="report-page" data-testid="fillout-report-page">
    {#if reportConfig.title}
      <h2 class="report-title" data-testid="fillout-report-title">{reportConfig.title}</h2>
    {/if}

    <div
      class="report-grid"
      style="grid-template-columns: repeat({columns}, minmax(0, 1fr)); grid-auto-rows: {rowHeight}px; gap: {gap}px;"
    >
      {#each widgets as widget (widget.id)}
        <div
          class="report-widget"
          style={gridStyle(widget)}
          data-testid={`report-widget-${widget.type}`}
          data-widget-id={widget.id}
        >
          {#if widget.type === 'score-tile' || widget.type === 'gauge'}
            {@const value = numericValue(widget)}
            {#if widget.type === 'gauge'}
              <GaugeChart {value} label={widget.text ?? ''} height={rowHeight * (widget.position.h ?? 2) - 24} />
            {:else}
              {@const interp = tileInterpretation(widget)}
              <div class="tile">
                {#if widget.text}<span class="tile-label">{widget.text}</span>{/if}
                <strong class="tile-value">{formatNumber(value)}</strong>
                {#if interp}
                  <span class="tile-band" style="background-color: {interp.color}">{interp.label}</span>
                {/if}
              </div>
            {/if}
          {:else if isChartWidget(widget)}
            {#await loadSeries(widget)}
              <div class="widget-loading">Loading…</div>
            {:then series}
              <FeedbackChart
                {series}
                chartType={CHART_TYPE[widget.type] ?? 'bar'}
                scoreName={widget.text ?? 'Value'}
                cohortMean={series.summary?.cohortMean ?? series.distribution?.mean ?? null}
                cohortStdDev={series.summary?.cohortStdDev ?? series.distribution?.stdDev ?? null}
                boxStats={series.cohortQuartiles ?? null}
                markerValue={series.summary?.participantValue ?? null}
                height={rowHeight * Math.max(1, widget.position.h ?? 3) - 32}
              />
              {#if series.normSource}
                <p class="widget-caption" data-testid="report-cohort-caption">{series.normSource}</p>
              {/if}
            {:catch}
              <div class="widget-error">Feedback unavailable.</div>
            {/await}
          {:else if widget.type === 'reaction-cohort-box'}
            <ReactionCohortBox
              cohortBundle={widget.comparison?.serverVariable
                ? resolveValue(widget.comparison.serverVariable)
                : undefined}
              questionId={widget.binding.key}
              sessionId={session?.id}
              stat={widget.reaction?.stat ?? 'median'}
              metric={widget.reaction?.metric ?? 'rt'}
              includeInvalidated={widget.reaction?.includeInvalidated ?? false}
              label={widget.text}
              height={rowHeight * Math.max(1, widget.position.h ?? 3) - 32}
            />
          {:else if widget.type === 'interpretive-text'}
            <p class="interp-text">{interpText(widget)}</p>
          {:else if widget.type === 'results-table'}
            <table class="results-table">
              <tbody>
                {#each tableRows(widget) as row}
                  <tr>
                    <th scope="row">{row.label}</th>
                    <td>{row.value}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else if widget.type === 'completion-meta'}
            <div class="meta">
              {#if durationLabel}<div><span>Time taken</span><strong>{durationLabel}</strong></div>{/if}
              {#if session?.responses?.length}
                <div><span>Answered</span><strong>{session.responses.length}</strong></div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if showPdf}
      <div class="report-actions">
        <button
          type="button"
          class="pdf-button"
          disabled={generatingReport}
          onclick={handleDownload}
          data-testid="report-pdf-download"
        >
          {generatingReport ? 'Preparing…' : 'Download report (PDF)'}
        </button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .report-page {
    width: 100%;
    max-width: 960px;
    margin: 2rem auto 0;
    padding: 0 1rem;
  }

  .report-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0 0 1rem;
    text-align: center;
  }

  .report-grid {
    display: grid;
    width: 100%;
  }

  .report-widget {
    min-width: 0;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 0.75rem;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    justify-content: center;
    height: 100%;
  }

  .tile-label {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .tile-value {
    font-size: 1.6rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    font-variant-numeric: tabular-nums;
  }

  .tile-band {
    align-self: flex-start;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #fff;
  }

  .widget-caption {
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
    margin: 0.25rem 0 0;
    text-align: center;
  }

  .widget-loading,
  .widget-error {
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .interp-text {
    font-size: 0.9rem;
    line-height: 1.5;
    color: hsl(var(--foreground));
    margin: 0;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .results-table th,
  .results-table td {
    text-align: left;
    padding: 0.25rem 0.4rem;
    border-bottom: 1px solid hsl(var(--border));
  }

  .results-table td {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: hsl(var(--foreground));
  }

  .meta {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    height: 100%;
  }

  .meta div {
    display: flex;
    flex-direction: column;
  }

  .meta span {
    font-size: 0.72rem;
    color: hsl(var(--muted-foreground));
  }

  .meta strong {
    font-size: 1.2rem;
    color: hsl(var(--foreground));
  }

  .report-actions {
    display: flex;
    justify-content: center;
    margin-top: 1.25rem;
  }

  .pdf-button {
    padding: 0.55rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--primary));
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .pdf-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .report-grid {
      grid-template-columns: 1fr !important;
      grid-auto-rows: auto !important;
    }

    .report-widget {
      grid-column: 1 / -1 !important;
      min-height: 160px;
    }
  }
</style>
