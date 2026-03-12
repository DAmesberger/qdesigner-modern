<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import StatisticalFeedback from './StatisticalFeedback.svelte';
  import {
    defaultStatisticalFeedbackConfig,
    normalizeStatisticalFeedbackConfig,
    validateStatisticalFeedbackConfig,
    type StatisticalFeedbackConfig,
    type StatisticalSourceMode,
    type ScoreInterpreterConfig,
    type ScoreInterpretationRange,
  } from './engine';
  import {
    DEFAULT_RANGE_COLORS,
    validateScoreInterpreterConfig,
  } from '$lib/runtime/feedback/ScoreInterpreter';
  import HelpTip from '$lib/help/components/HelpTip.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    analytics?: any;
    block?: any;
    onUpdate?: (updates: any) => void;
  }

  let { analytics, block, onUpdate }: Props = $props();
  const item = $derived(analytics || block);
  const config = $derived<StatisticalFeedbackConfig>(normalizeStatisticalFeedbackConfig(item));

  const sourceModes: Array<{ value: StatisticalSourceMode; label: string }> = [
    { value: 'current-session', label: 'Current Session' },
    { value: 'cohort', label: 'Cohort Aggregate' },
    { value: 'participant-vs-cohort', label: 'Participant vs Cohort' },
    { value: 'participant-vs-participant', label: 'Participant vs Participant' },
  ];

  const metricOptions = [
    { value: 'count', label: 'Count' },
    { value: 'mean', label: 'Mean' },
    { value: 'median', label: 'Median' },
    { value: 'std_dev', label: 'Std Deviation' },
    { value: 'p90', label: 'P90' },
    { value: 'p95', label: 'P95' },
    { value: 'p99', label: 'P99' },
    { value: 'z_score', label: 'Z-Score' },
  ] as const;

  const previewVariables = $derived.by(() => {
    const variables = designerStore.questionnaire.variables || [];
    const output: Record<string, unknown> = {
      participantId: 'preview-user-1',
      _participantId: 'preview-user-1',
    };

    for (const variable of variables) {
      output[variable.name] = variable.defaultValue ?? (variable.type === 'number' ? 0 : null);
    }

    if (config.dataSource.currentVariable && !(config.dataSource.currentVariable in output)) {
      output[config.dataSource.currentVariable] = 42;
    }

    return output;
  });

  const validationErrors = $derived(validateStatisticalFeedbackConfig(config));

  function emit(nextConfig: StatisticalFeedbackConfig): void {
    if (!item) {
      return;
    }

    onUpdate?.({
      ...item,
      config: nextConfig,
      dataSource: nextConfig.dataSource,
    });
  }

  function updateConfig(
    patch: Partial<Omit<StatisticalFeedbackConfig, 'dataSource'>> & {
      dataSource?: Partial<StatisticalFeedbackConfig['dataSource']>;
    }
  ): void {
    const nextConfig: StatisticalFeedbackConfig = {
      ...config,
      ...patch,
      dataSource: {
        ...config.dataSource,
        ...(patch.dataSource || {}),
      },
    };

    emit(nextConfig);
  }

  function updateSourceMode(mode: StatisticalSourceMode): void {
    updateConfig({ sourceMode: mode });
  }

  function applyDefaults(): void {
    updateConfig(defaultStatisticalFeedbackConfig);
  }

  // --- Score Interpretation Management ---

  const defaultColors = [
    DEFAULT_RANGE_COLORS.veryLow,
    DEFAULT_RANGE_COLORS.low,
    DEFAULT_RANGE_COLORS.moderate,
    DEFAULT_RANGE_COLORS.high,
    DEFAULT_RANGE_COLORS.veryHigh,
  ];

  function addScoreScale(): void {
    const existingScales = config.scoreInterpretation || [];
    const newScale: ScoreInterpreterConfig = {
      variableId: '',
      scaleName: `Scale ${existingScales.length + 1}`,
      ranges: [
        { min: 0, max: 10, label: 'Low', description: 'Score falls in the low range', color: DEFAULT_RANGE_COLORS.low },
        { min: 11, max: 20, label: 'Moderate', description: 'Score falls in the moderate range', color: DEFAULT_RANGE_COLORS.moderate },
        { min: 21, max: 30, label: 'High', description: 'Score falls in the high range', color: DEFAULT_RANGE_COLORS.high },
      ],
    };
    updateConfig({ scoreInterpretation: [...existingScales, newScale] });
  }

  function removeScoreScale(index: number): void {
    const scales = [...(config.scoreInterpretation || [])];
    scales.splice(index, 1);
    updateConfig({ scoreInterpretation: scales });
  }

  function updateScoreScale(index: number, patch: Partial<ScoreInterpreterConfig>): void {
    const scales = [...(config.scoreInterpretation || [])];
    const existing = scales[index];
    if (!existing) return;
    const updated: ScoreInterpreterConfig = {
      variableId: patch.variableId ?? existing.variableId,
      scaleName: patch.scaleName ?? existing.scaleName,
      ranges: patch.ranges ?? existing.ranges,
    };
    scales[index] = updated;
    updateConfig({ scoreInterpretation: scales });
  }

  function addRangeToScale(scaleIndex: number): void {
    const scales = [...(config.scoreInterpretation || [])];
    const scale = scales[scaleIndex];
    if (!scale) return;
    const lastRange = scale.ranges[scale.ranges.length - 1];
    const nextMin = lastRange ? lastRange.max + 1 : 0;
    const colorIdx = scale.ranges.length % defaultColors.length;
    const color = defaultColors[colorIdx] ?? DEFAULT_RANGE_COLORS.moderate;
    const updatedScale: ScoreInterpreterConfig = {
      ...scale,
      ranges: [
        ...scale.ranges,
        {
          min: nextMin,
          max: nextMin + 10,
          label: `Level ${scale.ranges.length + 1}`,
          description: '',
          color,
        },
      ],
    };
    scales[scaleIndex] = updatedScale;
    updateConfig({ scoreInterpretation: scales });
  }

  function removeRangeFromScale(scaleIndex: number, rangeIndex: number): void {
    const scales = [...(config.scoreInterpretation || [])];
    const scale = scales[scaleIndex];
    if (!scale) return;
    const updatedScale: ScoreInterpreterConfig = {
      ...scale,
      ranges: scale.ranges.filter((_: ScoreInterpretationRange, i: number) => i !== rangeIndex),
    };
    scales[scaleIndex] = updatedScale;
    updateConfig({ scoreInterpretation: scales });
  }

  function updateRangeInScale(
    scaleIndex: number,
    rangeIndex: number,
    patch: Partial<ScoreInterpretationRange>
  ): void {
    const scales = [...(config.scoreInterpretation || [])];
    const scale = scales[scaleIndex];
    if (!scale) return;
    const updatedScale: ScoreInterpreterConfig = {
      ...scale,
      ranges: scale.ranges.map((r: ScoreInterpretationRange, i: number) =>
        i === rangeIndex ? { ...r, ...patch } : r
      ),
    };
    scales[scaleIndex] = updatedScale;
    updateConfig({ scoreInterpretation: scales });
  }

  const scaleValidationErrors = $derived.by((): string[][] => {
    return (config.scoreInterpretation || []).map((scale) =>
      validateScoreInterpreterConfig(scale)
    );
  });
</script>

{#if item}
  <div class="stats-designer" data-testid="stats-feedback-designer">
    <div class="row">
      <label for="stats-title">Title</label>
      <input
        id="stats-title"
        class="input"
        type="text"
        value={config.title}
        oninput={(event) =>
          updateConfig({ title: (event.currentTarget as HTMLInputElement).value })}
      />
    </div>

    <div class="row">
      <label for="stats-subtitle">Subtitle</label>
      <input
        id="stats-subtitle"
        class="input"
        type="text"
        value={config.subtitle}
        oninput={(event) =>
          updateConfig({ subtitle: (event.currentTarget as HTMLInputElement).value })}
      />
    </div>

    <div class="grid-two">
      <div class="row">
        <label for="stats-source-mode" class="flex items-center gap-1">Source Mode <HelpTip helpKey="statisticalFeedback.sourceModes" /></label>
        <Select
          id="stats-source-mode"
          value={config.sourceMode}
          onchange={(event) =>
            updateSourceMode(
              (event.currentTarget as HTMLSelectElement).value as StatisticalSourceMode
            )}
        >
          {#each sourceModes as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </Select>
      </div>

      <div class="row">
        <label for="stats-metric">Metric</label>
        <Select
          id="stats-metric"
          value={config.metric}
          onchange={(event) =>
            updateConfig({
              metric: (event.currentTarget as HTMLSelectElement)
                .value as StatisticalFeedbackConfig['metric'],
            })}
        >
          {#each metricOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </Select>
      </div>

      <div class="row">
        <label for="stats-chart-type" class="flex items-center gap-1">Chart Type <HelpTip helpKey="statisticalFeedback.charts" /></label>
        <Select
          id="stats-chart-type"
          value={config.chartType}
          onchange={(event) =>
            updateConfig({
              chartType: (event.currentTarget as HTMLSelectElement)
                .value as StatisticalFeedbackConfig['chartType'],
            })}
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="radar">Radar / Spider</option>
          <option value="scatter">Scatter</option>
          <option value="histogram">Histogram</option>
          <option value="box">Box Plot</option>
          <option value="bell-curve">Bell Curve (Normal Distribution)</option>
          <option value="gauge">Gauge / Arc</option>
        </Select>
      </div>

      <div class="row">
        <label for="stats-refresh">Refresh (ms)</label>
        <input
          id="stats-refresh"
          class="input"
          type="number"
          min="0"
          step="100"
          value={config.refreshMs}
          oninput={(event) =>
            updateConfig({
              refreshMs: Number((event.currentTarget as HTMLInputElement).value || 0),
            })}
        />
      </div>
    </div>

    {#if config.sourceMode === 'current-session'}
      <div class="row">
        <label for="stats-current-variable">Current Variable</label>
        <Select
          id="stats-current-variable"
          value={config.dataSource.currentVariable}
          onchange={(event) =>
            updateConfig({
              dataSource: { currentVariable: (event.currentTarget as HTMLSelectElement).value },
            })}
        >
          <option value="">Select variable...</option>
          {#each designerStore.questionnaire.variables as variable}
            <option value={variable.name}>{variable.name}</option>
          {/each}
        </Select>
      </div>
    {:else}
      <div class="grid-two">
        <div class="row">
          <label for="stats-questionnaire-id">Questionnaire ID</label>
          <input
            id="stats-questionnaire-id"
            class="input"
            data-testid="stats-questionnaire-id"
            type="text"
            value={config.dataSource.questionnaireId}
            oninput={(event) =>
              updateConfig({
                dataSource: { questionnaireId: (event.currentTarget as HTMLInputElement).value },
              })}
          />
        </div>

        <div class="row">
          <label for="stats-data-source-type">Data Source</label>
          <Select
            id="stats-data-source-type"
            value={config.dataSource.source}
            onchange={(event) =>
              updateConfig({
                dataSource: {
                  source: (event.currentTarget as HTMLSelectElement).value as
                    | 'variable'
                    | 'response',
                },
              })}
          >
            <option value="variable">Variable</option>
            <option value="response">Question Response</option>
          </Select>
        </div>
      </div>

      <div class="row">
        <label for="stats-data-key">Variable / Question Key</label>
        <input
          id="stats-data-key"
          class="input"
          data-testid="stats-data-key"
          type="text"
          value={config.dataSource.key}
          oninput={(event) =>
            updateConfig({ dataSource: { key: (event.currentTarget as HTMLInputElement).value } })}
        />
      </div>

      {#if config.sourceMode === 'participant-vs-cohort' || config.sourceMode === 'participant-vs-participant'}
        <div class="row">
          <label for="stats-participant-id">Primary Participant ID</label>
          <input
            id="stats-participant-id"
            class="input"
            data-testid="stats-participant-id"
            type="text"
            value={config.dataSource.participantId}
            placeholder="e.g. participant-001"
            oninput={(event) =>
              updateConfig({
                dataSource: { participantId: (event.currentTarget as HTMLInputElement).value },
              })}
          />
        </div>
      {/if}

      {#if config.sourceMode === 'participant-vs-participant'}
        <div class="row">
          <label for="stats-compare-participant-id">Comparison Participant ID</label>
          <input
            id="stats-compare-participant-id"
            class="input"
            data-testid="stats-compare-participant-id"
            type="text"
            value={config.dataSource.comparisonParticipantId}
            oninput={(event) =>
              updateConfig({
                dataSource: {
                  comparisonParticipantId: (event.currentTarget as HTMLInputElement).value,
                },
              })}
          />
        </div>
      {/if}
    {/if}

    <div class="toggles">
      <label class="toggle">
        <input
          type="checkbox"
          checked={config.showSummary}
          onchange={(event) =>
            updateConfig({ showSummary: (event.currentTarget as HTMLInputElement).checked })}
        />
        Show Summary
      </label>

      <label class="toggle">
        <input
          type="checkbox"
          checked={config.showPercentile}
          onchange={(event) =>
            updateConfig({ showPercentile: (event.currentTarget as HTMLInputElement).checked })}
        />
        Show Percentile
      </label>
    </div>

    <!-- Score Interpretation Configuration -->
    <div class="section-header" data-testid="score-interpretation-section">
      <strong>Score Interpretation</strong>
      <button type="button" class="link" onclick={addScoreScale}>+ Add Scale</button>
    </div>

    {#each config.scoreInterpretation || [] as scale, scaleIdx}
      <div class="score-scale-card" data-testid={`score-scale-${scaleIdx}`}>
        <div class="scale-header">
          <span class="scale-title">Scale: {scale.scaleName || 'Unnamed'}</span>
          <button type="button" class="link danger" onclick={() => removeScoreScale(scaleIdx)}>Remove</button>
        </div>

        <div class="grid-two">
          <div class="row">
            <label for={`scale-name-${scaleIdx}`}>Scale Name</label>
            <input
              id={`scale-name-${scaleIdx}`}
              class="input"
              type="text"
              value={scale.scaleName}
              oninput={(event) =>
                updateScoreScale(scaleIdx, { scaleName: (event.currentTarget as HTMLInputElement).value })}
            />
          </div>
          <div class="row">
            <label for={`scale-variable-${scaleIdx}`}>Variable</label>
            <Select
              id={`scale-variable-${scaleIdx}`}
              value={scale.variableId}
              onchange={(event) =>
                updateScoreScale(scaleIdx, { variableId: (event.currentTarget as HTMLSelectElement).value })}
            >
              <option value="">Select variable...</option>
              {#each designerStore.questionnaire.variables as variable}
                <option value={variable.name}>{variable.name}</option>
              {/each}
            </Select>
          </div>
        </div>

        <div class="ranges-header">
          <span>Ranges</span>
          <button type="button" class="link" onclick={() => addRangeToScale(scaleIdx)}>+ Add Range</button>
        </div>

        {#each scale.ranges as range, rangeIdx}
          <div class="range-row" data-testid={`range-${scaleIdx}-${rangeIdx}`}>
            <input
              class="input range-input"
              type="number"
              value={range.min}
              title="Min"
              oninput={(event) =>
                updateRangeInScale(scaleIdx, rangeIdx, { min: Number((event.currentTarget as HTMLInputElement).value) })}
            />
            <span class="range-sep">-</span>
            <input
              class="input range-input"
              type="number"
              value={range.max}
              title="Max"
              oninput={(event) =>
                updateRangeInScale(scaleIdx, rangeIdx, { max: Number((event.currentTarget as HTMLInputElement).value) })}
            />
            <input
              class="input range-label-input"
              type="text"
              value={range.label}
              placeholder="Label"
              oninput={(event) =>
                updateRangeInScale(scaleIdx, rangeIdx, { label: (event.currentTarget as HTMLInputElement).value })}
            />
            <input
              class="color-picker"
              type="color"
              value={range.color}
              title="Color"
              oninput={(event) =>
                updateRangeInScale(scaleIdx, rangeIdx, { color: (event.currentTarget as HTMLInputElement).value })}
            />
            <button type="button" class="link danger range-remove" onclick={() => removeRangeFromScale(scaleIdx, rangeIdx)}>x</button>
          </div>
        {/each}

        {#if scaleValidationErrors[scaleIdx]?.length}
          <div class="validation scale-validation">
            {#each scaleValidationErrors[scaleIdx] as error}
              <p>{error}</p>
            {/each}
          </div>
        {/if}
      </div>
    {/each}

    <!-- Report Download Toggle -->
    <div class="toggles">
      <label class="toggle">
        <input
          type="checkbox"
          checked={config.enableReportDownload}
          onchange={(event) =>
            updateConfig({ enableReportDownload: (event.currentTarget as HTMLInputElement).checked })}
        />
        Enable "Download Report" Button
      </label>
    </div>

    {#if config.enableReportDownload}
      <div class="row">
        <label for="report-title">Report Title (optional)</label>
        <input
          id="report-title"
          class="input"
          type="text"
          value={config.reportTitle || ''}
          placeholder="Defaults to feedback title"
          oninput={(event) =>
            updateConfig({ reportTitle: (event.currentTarget as HTMLInputElement).value })}
        />
      </div>
    {/if}

    {#if validationErrors.length > 0}
      <div class="validation" data-testid="stats-feedback-validation">
        {#each validationErrors as message}
          <p>{message}</p>
        {/each}
      </div>
    {/if}

    <div class="preview" data-testid="stats-feedback-preview">
      <div class="preview-header">
        <strong>Live Preview</strong>
        <button type="button" class="link" onclick={applyDefaults}>Reset Defaults</button>
      </div>
      <StatisticalFeedback
        analytics={{ ...item, config }}
        mode="preview"
        variables={previewVariables}
      />
    </div>
  </div>
{/if}

<style>
  .stats-designer {
    display: grid;
    gap: 0.75rem;
  }

  .grid-two {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .row {
    display: grid;
    gap: 0.3rem;
  }

  .row label {
    font-size: 0.78rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .input {
    width: 100%;
    border: 1px solid hsl(var(--border));
    border-radius: 0.45rem;
    background: hsl(var(--background));
    padding: 0.45rem 0.6rem;
    font-size: 0.82rem;
    color: hsl(var(--foreground));
  }

  .toggles {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: hsl(var(--foreground));
  }

  .validation {
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--destructive) / 0.4);
    background: hsl(var(--destructive) / 0.15);
    color: hsl(var(--destructive));
    padding: 0.55rem 0.7rem;
    font-size: 0.78rem;
  }

  .validation p {
    margin: 0;
  }

  .preview {
    border: 1px solid hsl(var(--border));
    border-radius: 0.6rem;
    background: hsl(var(--muted));
    padding: 0.65rem;
    display: grid;
    gap: 0.5rem;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.78rem;
    color: hsl(var(--foreground));
  }

  .link {
    border: none;
    background: transparent;
    color: hsl(var(--primary));
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0;
  }

  .link.danger {
    color: hsl(var(--destructive));
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.82rem;
    color: hsl(var(--foreground));
    padding-top: 0.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .score-scale-card {
    display: grid;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    background: hsl(var(--muted));
  }

  .scale-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .scale-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .ranges-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    font-weight: 600;
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .range-input {
    width: 60px;
    text-align: center;
  }

  .range-sep {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .range-label-input {
    flex: 1;
    min-width: 0;
  }

  .color-picker {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }

  .range-remove {
    font-size: 0.82rem;
    font-weight: 700;
  }

  .scale-validation {
    font-size: 0.72rem;
  }
</style>
