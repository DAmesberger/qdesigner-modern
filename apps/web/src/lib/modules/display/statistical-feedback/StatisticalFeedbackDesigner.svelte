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
  import { NORM_TABLES, CUSTOM_NORM_TABLE_ID } from '$lib/runtime/feedback/normTables';
  import type { CustomNormConfig } from './engine';
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
    { value: 'norm-table', label: 'Norm Table (bundled / offline)' },
    { value: 'self-baseline', label: 'Self-Baseline (pre / post)' },
    { value: 'cohort', label: 'Cohort Aggregate' },
    { value: 'participant-vs-cohort', label: 'Participant vs Cohort' },
    { value: 'participant-vs-participant', label: 'Participant vs Participant' },
  ];

  // Modes that resolve entirely from local variables (no analytics API call);
  // they surface a "current variable" picker instead of a questionnaire/key pair.
  const localModes: StatisticalSourceMode[] = [
    'current-session',
    'norm-table',
    'self-baseline',
  ];
  const isLocalMode = $derived(localModes.includes(config.sourceMode));

  const normTableOptions = NORM_TABLES.map((n) => ({ value: n.id, label: n.label }));

  function updateCustomNorm(patch: Partial<CustomNormConfig>): void {
    const existing: CustomNormConfig = config.dataSource.customNorm ?? {
      label: 'Custom norm',
      mean: 0,
      sd: 1,
    };
    updateConfig({ dataSource: { customNorm: { ...existing, ...patch } } });
  }

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

  // Scale-score bindings (E-FEEDBACK-1): each scale declared in settings.scoring exposes
  // its computed fields as `score.<id>.<field>` so a feedback metric can bind to a
  // T-score / percentile / band, not just a raw response variable.
  const scaleScoreFields = [
    { field: 'value', label: 'Score' },
    { field: 'tScore', label: 'T-Score' },
    { field: 'percentile', label: 'Percentile' },
    { field: 'z', label: 'Z-Score' },
    { field: 'stanine', label: 'Stanine' },
  ] as const;

  const scaleScoreOptions = $derived.by(() => {
    const scales = designerStore.questionnaire.settings?.scoring?.scales ?? [];
    return scales.flatMap((scale) =>
      scaleScoreFields.map((f) => ({
        value: `score.${scale.id}.${f.field}`,
        label: `${scale.name || scale.id} · ${f.label}`,
      }))
    );
  });

  // Tokens a band message can pipe (E-FEEDBACK-6): the E-FEEDBACK-1 scale-score
  // fields (score.<id>.<field>) plus every declared question variable. Used by
  // the per-band "Insert variable" helper.
  const messageVariableOptions = $derived.by(() => {
    const questionVars = (designerStore.questionnaire.variables || []).map((variable) => ({
      value: variable.name,
      label: variable.name,
    }));
    return [...scaleScoreOptions, ...questionVars];
  });

  function insertBandVariable(scaleIdx: number, rangeIdx: number, token: string): void {
    if (!token) return;
    const scale = (config.scoreInterpretation || [])[scaleIdx];
    const existing = scale?.ranges[rangeIdx]?.message ?? '';
    const needsSpace = existing.length > 0 && !/\s$/.test(existing);
    const next = `${existing}${needsSpace ? ' ' : ''}{{${token}}}`;
    updateRangeInScale(scaleIdx, rangeIdx, { message: next });
  }

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

  // --- Panel behavior (item-level: autoAdvance / displayDuration) ---
  // autoAdvance === false (the default) means the panel waits for the
  // fillout overlay's Continue button; autoAdvance === true auto-dismisses
  // after displayDuration ms.
  const autoDismiss = $derived(item?.autoAdvance === true);
  const displayDuration = $derived(
    typeof item?.displayDuration === 'number' ? item.displayDuration : 3500
  );

  function setAutoDismiss(enabled: boolean): void {
    if (!item) return;
    onUpdate?.({
      ...item,
      autoAdvance: enabled,
      displayDuration: typeof item.displayDuration === 'number' ? item.displayDuration : 3500,
      config,
      dataSource: config.dataSource,
    });
  }

  function setDisplayDuration(ms: number): void {
    if (!item) return;
    onUpdate?.({
      ...item,
      displayDuration: Number.isFinite(ms) && ms > 0 ? ms : 3500,
      config,
      dataSource: config.dataSource,
    });
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
        {#if config.sourceMode === 'participant-vs-participant'}
          <div class="behavior-warning" data-testid="stats-source-mode-warning">
            Participant vs Participant compares two named participants and reads
            other participants' per-session values. It requires a signed-in
            researcher, so it will NOT render for anonymous participants during
            fillout — they see an explanatory message instead. Use Participant vs
            Cohort for participant-facing feedback.
          </div>
        {/if}
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

    {#if isLocalMode}
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
          {#if scaleScoreOptions.length > 0}
            <optgroup label="Scale scores" data-testid="stats-scale-scores-optgroup">
              {#each scaleScoreOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </optgroup>
          {/if}
        </Select>
      </div>

      {#if config.sourceMode === 'self-baseline'}
        <div class="row">
          <label for="stats-baseline-variable">Baseline (pre-test) Variable</label>
          <Select
            id="stats-baseline-variable"
            value={config.dataSource.baselineVariable ?? ''}
            onchange={(event) =>
              updateConfig({
                dataSource: {
                  baselineVariable: (event.currentTarget as HTMLSelectElement).value,
                },
              })}
          >
            <option value="">Select baseline variable...</option>
            {#each designerStore.questionnaire.variables as variable}
              <option value={variable.name}>{variable.name}</option>
            {/each}
            {#if scaleScoreOptions.length > 0}
              <optgroup label="Scale scores">
                {#each scaleScoreOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </optgroup>
            {/if}
          </Select>
          <p class="hint">
            The earlier administration's value, typically piped in via urlParams or a
            prior session variable.
          </p>
        </div>
      {/if}

      {#if config.sourceMode === 'norm-table' || config.sourceMode === 'self-baseline'}
        <div class="row" data-testid="stats-norm-table-row">
          <label for="stats-norm-table" class="flex items-center gap-1">
            {config.sourceMode === 'norm-table' ? 'Norm Table' : 'Norm Table (for reliable-change index)'}
          </label>
          <Select
            id="stats-norm-table"
            value={config.dataSource.normTableId ?? ''}
            onchange={(event) =>
              updateConfig({
                dataSource: { normTableId: (event.currentTarget as HTMLSelectElement).value },
              })}
          >
            <option value="">
              {config.sourceMode === 'self-baseline' ? 'None (delta only)' : 'Select norm...'}
            </option>
            {#each normTableOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
            <option value={CUSTOM_NORM_TABLE_ID}>Custom norm (enter mean / SD)…</option>
          </Select>
        </div>

        {#if config.dataSource.normTableId === CUSTOM_NORM_TABLE_ID}
          <div class="custom-norm-card" data-testid="stats-custom-norm">
            <div class="row">
              <label for="custom-norm-label">Custom norm label</label>
              <input
                id="custom-norm-label"
                class="input"
                type="text"
                value={config.dataSource.customNorm?.label ?? ''}
                placeholder="e.g. Adult community sample"
                oninput={(event) =>
                  updateCustomNorm({ label: (event.currentTarget as HTMLInputElement).value })}
              />
            </div>
            <div class="grid-two">
              <div class="row">
                <label for="custom-norm-mean">Mean</label>
                <input
                  id="custom-norm-mean"
                  class="input"
                  type="number"
                  step="any"
                  value={config.dataSource.customNorm?.mean ?? 0}
                  oninput={(event) =>
                    updateCustomNorm({ mean: Number((event.currentTarget as HTMLInputElement).value) })}
                />
              </div>
              <div class="row">
                <label for="custom-norm-sd">SD</label>
                <input
                  id="custom-norm-sd"
                  class="input"
                  type="number"
                  step="any"
                  min="0"
                  value={config.dataSource.customNorm?.sd ?? 1}
                  oninput={(event) =>
                    updateCustomNorm({ sd: Number((event.currentTarget as HTMLInputElement).value) })}
                />
              </div>
            </div>
            {#if config.sourceMode === 'self-baseline'}
              <div class="row">
                <label for="custom-norm-reliability">Test-retest reliability (optional, for RCI)</label>
                <input
                  id="custom-norm-reliability"
                  class="input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={config.dataSource.customNorm?.reliability ?? ''}
                  placeholder="e.g. 0.84"
                  oninput={(event) => {
                    const raw = (event.currentTarget as HTMLInputElement).value;
                    updateCustomNorm({ reliability: raw === '' ? undefined : Number(raw) });
                  }}
                />
              </div>
            {/if}
          </div>
        {/if}
      {/if}
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
          <div class="range-block" data-testid={`range-${scaleIdx}-${rangeIdx}`}>
            <div class="range-row">
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
            <input
              class="input range-description-input"
              type="text"
              value={range.description}
              placeholder="Description shown to participant (optional)"
              title="Description"
              oninput={(event) =>
                updateRangeInScale(scaleIdx, rangeIdx, { description: (event.currentTarget as HTMLInputElement).value })}
            />
            <div class="band-message-field">
              <textarea
                class="input band-message-input"
                rows="2"
                data-testid={`band-message-${scaleIdx}-${rangeIdx}`}
                value={range.message ?? ''}
                placeholder={'Personalized message (optional). Pipe values with {{score.anxiety.value}}, {{score.anxiety.band}}…'}
                title="Piped narrative shown when the score lands in this band"
                oninput={(event) =>
                  updateRangeInScale(scaleIdx, rangeIdx, { message: (event.currentTarget as HTMLTextAreaElement).value })}
              ></textarea>
              {#if messageVariableOptions.length > 0}
                <Select
                  value=""
                  placeholder=""
                  onchange={(event) => {
                    const select = event.currentTarget as HTMLSelectElement;
                    insertBandVariable(scaleIdx, rangeIdx, select.value);
                    select.value = '';
                  }}
                >
                  <option value="">Insert variable…</option>
                  {#each messageVariableOptions as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </Select>
              {/if}
            </div>
          </div>
        {/each}

        <!-- Rule summary (E-FEEDBACK-6): per-band read-out of the message that
             will fire, so the researcher can self-verify coverage. -->
        <div class="rule-summary" data-testid={`rule-summary-${scaleIdx}`}>
          <span class="rule-summary-title">Band messages</span>
          {#each scale.ranges as range}
            <div class="rule-summary-row">
              <span class="rule-band" style={`background-color: ${range.color};`}>
                {range.label || 'Unnamed'} ({range.min}–{range.max})
              </span>
              {#if range.message && range.message.trim()}
                <span class="rule-message">{range.message}</span>
              {:else}
                <span class="rule-message muted">No personalized message</span>
              {/if}
            </div>
          {/each}
        </div>

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

    <!-- Panel Behavior -->
    <div class="section-header">
      <strong>Panel behavior</strong>
    </div>

    <div class="behavior" data-testid="stats-feedback-behavior">
      <label class="toggle">
        <input
          type="checkbox"
          data-testid="stats-require-continue"
          checked={!autoDismiss}
          onchange={(event) =>
            setAutoDismiss(!(event.currentTarget as HTMLInputElement).checked)}
        />
        Require participant to press Continue
      </label>

      <div class="row">
        <label for="stats-display-duration">Auto-dismiss after (ms)</label>
        <input
          id="stats-display-duration"
          class="input"
          data-testid="stats-display-duration"
          type="number"
          min="500"
          step="500"
          value={displayDuration}
          disabled={!autoDismiss}
          oninput={(event) =>
            setDisplayDuration(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </div>

      {#if autoDismiss && config.enableReportDownload}
        <div class="behavior-warning" data-testid="stats-behavior-warning">
          Auto-dismiss is on together with the report button — the panel will
          advance on a timer and participants may lose the report before they can
          print it. Consider requiring Continue instead.
        </div>
      {/if}
    </div>

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

  .range-block {
    display: grid;
    gap: 0.3rem;
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .range-description-input {
    font-size: 0.78rem;
  }

  .band-message-field {
    display: grid;
    gap: 0.3rem;
  }

  .band-message-input {
    font-size: 0.78rem;
    resize: vertical;
    min-height: 2.4rem;
    font-family: inherit;
  }

  .rule-summary {
    display: grid;
    gap: 0.3rem;
    padding: 0.5rem 0.6rem;
    border: 1px dashed hsl(var(--border));
    border-radius: 0.5rem;
    background: hsl(var(--background));
  }

  .rule-summary-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .rule-summary-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .rule-band {
    flex-shrink: 0;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    color: #fff;
    font-weight: 600;
    font-size: 0.7rem;
  }

  .rule-message {
    color: hsl(var(--foreground));
    line-height: 1.35;
    word-break: break-word;
  }

  .rule-message.muted {
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }

  .behavior {
    display: grid;
    gap: 0.5rem;
  }

  .behavior-warning {
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--warning, var(--destructive)) / 0.4);
    background: hsl(var(--warning, var(--destructive)) / 0.12);
    color: hsl(var(--foreground));
    padding: 0.55rem 0.7rem;
    font-size: 0.75rem;
    line-height: 1.35;
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

  .hint {
    font-size: 0.72rem;
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .custom-norm-card {
    display: grid;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    background: hsl(var(--muted));
  }
</style>
