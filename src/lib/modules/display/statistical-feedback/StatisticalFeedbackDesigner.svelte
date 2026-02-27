<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import StatisticalFeedback from './StatisticalFeedback.svelte';
  import {
    defaultStatisticalFeedbackConfig,
    normalizeStatisticalFeedbackConfig,
    validateStatisticalFeedbackConfig,
    type StatisticalFeedbackConfig,
    type StatisticalSourceMode,
  } from './engine';

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
        <label for="stats-source-mode">Source Mode</label>
        <select
          id="stats-source-mode"
          class="input"
          data-testid="stats-source-mode"
          value={config.sourceMode}
          onchange={(event) =>
            updateSourceMode(
              (event.currentTarget as HTMLSelectElement).value as StatisticalSourceMode
            )}
        >
          {#each sourceModes as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div class="row">
        <label for="stats-metric">Metric</label>
        <select
          id="stats-metric"
          class="input"
          data-testid="stats-metric"
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
        </select>
      </div>

      <div class="row">
        <label for="stats-chart-type">Chart Type</label>
        <select
          id="stats-chart-type"
          class="input"
          data-testid="stats-chart-type"
          value={config.chartType}
          onchange={(event) =>
            updateConfig({
              chartType: (event.currentTarget as HTMLSelectElement)
                .value as StatisticalFeedbackConfig['chartType'],
            })}
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
        </select>
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
        <select
          id="stats-current-variable"
          class="input"
          data-testid="stats-current-variable"
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
        </select>
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
          <select
            id="stats-data-source-type"
            class="input"
            data-testid="stats-data-source-type"
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
          </select>
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
    color: #334155;
  }

  .input {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 0.45rem;
    background: #fff;
    padding: 0.45rem 0.6rem;
    font-size: 0.82rem;
    color: #0f172a;
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
    color: #334155;
  }

  .validation {
    border-radius: 0.5rem;
    border: 1px solid #fca5a5;
    background: #fee2e2;
    color: #991b1b;
    padding: 0.55rem 0.7rem;
    font-size: 0.78rem;
  }

  .validation p {
    margin: 0;
  }

  .preview {
    border: 1px solid #dbe3ed;
    border-radius: 0.6rem;
    background: #f8fafc;
    padding: 0.65rem;
    display: grid;
    gap: 0.5rem;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.78rem;
    color: #334155;
  }

  .link {
    border: none;
    background: transparent;
    color: #2563eb;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0;
  }
</style>
