<script lang="ts">
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import type { ReportPageConfig, ReportWidget } from '$lib/shared';
  import { generateId } from '$lib/shared';
  import { NORM_TABLES } from '$lib/runtime/feedback/normTables';
  import { Plus, Trash2, LayoutGrid, Eye } from 'lucide-svelte';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import ReportGridEditor from './ReportGridEditor.svelte';
  import ReportPageView from '$lib/fillout/components/ReportPageView.svelte';
  import { buildSampleReportData } from './report-sample-data';

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  // Which widget the visual grid editor currently has selected — highlights the
  // matching config card below so the two views stay in lockstep.
  let selectedId = $state<string | null>(null);
  let viewMode = $state<'layout' | 'preview'>('layout');

  const DEFAULT_CONFIG: ReportPageConfig = {
    enabled: false,
    title: '',
    layout: { columns: 12, rowHeight: 80, gap: 16 },
    widgets: [],
    enablePdfDownload: false,
    refreshMs: 24 * 60 * 60 * 1000,
  };

  let config = $state<ReportPageConfig>(structuredClone(DEFAULT_CONFIG));

  $effect(() => {
    if (open) {
      selectedId = null;
      viewMode = 'layout';
      const existing = designerStore.questionnaire.settings?.report;
      config = existing
        ? {
            ...structuredClone(DEFAULT_CONFIG),
            ...structuredClone(existing),
            layout: existing.layout ?? { columns: 12, rowHeight: 80, gap: 16 },
            widgets: (existing.widgets ?? []).map((w) => ({ ...w })),
          }
        : structuredClone(DEFAULT_CONFIG);
    }
  });

  const widgetTypes: Array<{ value: ReportWidget['type']; label: string }> = [
    { value: 'score-tile', label: 'Score tile' },
    { value: 'bar', label: 'Bar chart' },
    { value: 'box-cohort', label: 'Box vs cohort' },
    { value: 'radar-profile', label: 'Radar profile' },
    { value: 'distribution-with-marker', label: 'Distribution + marker' },
    { value: 'gauge', label: 'Gauge / arc' },
    { value: 'interpretive-text', label: 'Interpretive text' },
    { value: 'results-table', label: 'Results table' },
    { value: 'completion-meta', label: 'Completion metadata' },
  ];

  const comparisonSources: Array<{ value: NonNullable<ReportWidget['comparison']>['source']; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'norm-table', label: 'Norm table' },
    { value: 'custom-norm', label: 'Custom norm' },
    { value: 'self-baseline', label: 'Self baseline' },
    { value: 'server-variable', label: 'Server variable (cohort, offline)' },
  ];

  const scoreFields = ['value', 'tScore', 'percentile', 'z', 'stanine', 'band'];

  const posFields: Array<[keyof ReportWidget['position'], string]> = [
    ['x', 'X'],
    ['y', 'Y'],
    ['w', 'W'],
    ['h', 'H'],
  ];

  const variableOptions = $derived(
    (designerStore.questionnaire.variables || []).map((v) => ({ value: v.name, label: v.name }))
  );
  const scaleOptions = $derived(
    (designerStore.questionnaire.settings?.scoring?.scales ?? []).map((s) => ({
      value: s.id,
      label: s.name || s.id,
    }))
  );
  // Object-typed server variables carry the cohort bundle a comparison can bind.
  const serverVariableOptions = $derived(
    (designerStore.questionnaire.variables || [])
      .filter((v) => v.server && v.type === 'object')
      .map((v) => ({ value: v.name, label: v.name }))
  );
  const normOptions = NORM_TABLES.map((n) => ({ value: n.id, label: n.label }));

  const typeLabels: Record<string, string> = Object.fromEntries(
    widgetTypes.map((t) => [t.value, t.label])
  );

  // Live preview reuses the REAL participant renderer against sample values derived
  // from the widgets' bindings, forced `enabled` so an unsaved draft still previews.
  const previewData = $derived(buildSampleReportData(config));
  const previewConfig = $derived({ ...config, enabled: true });

  function nextRow(): number {
    return config.widgets.reduce((max, w) => Math.max(max, w.position.y + w.position.h), 0);
  }

  function addWidget(): void {
    const widget: ReportWidget = {
      id: generateId(),
      type: 'score-tile',
      position: { x: 0, y: nextRow(), w: 6, h: 2 },
      binding: { source: 'variable', key: '' },
    };
    config.widgets = [...config.widgets, widget];
  }

  function removeWidget(index: number): void {
    config.widgets = config.widgets.filter((_, i) => i !== index);
  }

  function updateWidget(index: number, patch: Partial<ReportWidget>): void {
    config.widgets = config.widgets.map((w, i) => (i === index ? { ...w, ...patch } : w));
  }

  function updatePosition(index: number, patch: Partial<ReportWidget['position']>): void {
    const w = config.widgets[index];
    if (!w) return;
    updateWidget(index, { position: { ...w.position, ...patch } });
  }

  function updateBinding(index: number, patch: Partial<ReportWidget['binding']>): void {
    const w = config.widgets[index];
    if (!w) return;
    updateWidget(index, { binding: { ...w.binding, ...patch } });
  }

  function updateComparison(index: number, patch: Partial<NonNullable<ReportWidget['comparison']>>): void {
    const w = config.widgets[index];
    if (!w) return;
    const base: NonNullable<ReportWidget['comparison']> = w.comparison ?? { source: 'none', fallback: 'hide' };
    updateWidget(index, { comparison: { ...base, ...patch } });
  }

  function keyOptionsFor(source: ReportWidget['binding']['source']) {
    return source === 'score' ? scaleOptions : variableOptions;
  }

  function save(): void {
    const clean: ReportPageConfig = {
      ...config,
      title: config.title?.trim() ? config.title.trim() : undefined,
      widgets: config.widgets,
    };
    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        report: clean.enabled || clean.widgets.length > 0 ? clean : undefined,
      },
    });
    open = false;
  }

  function cancel(): void {
    open = false;
  }
</script>

<Dialog
  bind:open
  title="Report Page"
  description="Design the participant-facing results page (E-FEEDBACK-3). Widgets bind to variables or scale scores and render offline from the completed session; cohort widgets bind an object-typed server variable."
  size="lg"
  onclose={cancel}
>
  <div class="space-y-4">
    <!-- Page-level settings -->
    <div class="grid grid-cols-2 gap-3">
      <label class="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={config.enabled}
          onchange={(e) => (config.enabled = e.currentTarget.checked)}
          class="rounded border-border"
          data-testid="report-enabled"
        />
        Show report page after completion
      </label>
      <label class="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={config.enablePdfDownload ?? false}
          onchange={(e) => (config.enablePdfDownload = e.currentTarget.checked)}
          class="rounded border-border"
        />
        Enable PDF download
      </label>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-xs text-muted-foreground mb-0.5" for="report-title">Title</label>
        <input
          id="report-title"
          type="text"
          value={config.title ?? ''}
          oninput={(e) => (config.title = e.currentTarget.value)}
          class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
          placeholder="Your results"
        />
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="block text-xs text-muted-foreground mb-0.5" for="report-rowheight">Row h</label>
          <input
            id="report-rowheight"
            type="number"
            min="20"
            value={config.layout.rowHeight}
            oninput={(e) => (config.layout = { ...config.layout, rowHeight: Number(e.currentTarget.value) || 80 })}
            class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
          />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-0.5" for="report-gap">Gap</label>
          <input
            id="report-gap"
            type="number"
            min="0"
            value={config.layout.gap}
            oninput={(e) => (config.layout = { ...config.layout, gap: Number(e.currentTarget.value) || 0 })}
            class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
          />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-0.5" for="report-refresh">Refresh h</label>
          <input
            id="report-refresh"
            type="number"
            min="0"
            value={Math.round((config.refreshMs ?? 0) / 3_600_000)}
            oninput={(e) => (config.refreshMs = (Number(e.currentTarget.value) || 0) * 3_600_000)}
            class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
            title="Server-variable fetch-skip window, in hours"
          />
        </div>
      </div>
    </div>

    <!-- Widgets -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-foreground">Widgets ({config.widgets.length})</span>
        {#if config.widgets.length > 0}
          <div class="inline-flex rounded-md border border-border overflow-hidden text-xs" role="tablist" aria-label="Report editor view">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'layout'}
              class="flex items-center gap-1 px-2.5 py-1 {viewMode === 'layout' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (viewMode = 'layout')}
              data-testid="report-view-layout"
            >
              <LayoutGrid class="w-3.5 h-3.5" /> Layout
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'preview'}
              class="flex items-center gap-1 px-2.5 py-1 border-l border-border {viewMode === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (viewMode = 'preview')}
              data-testid="report-view-preview"
            >
              <Eye class="w-3.5 h-3.5" /> Preview
            </button>
          </div>
        {/if}
      </div>

      {#if config.widgets.length === 0}
        <!-- Empty state: friendly guidance + the add call-to-action. -->
        <div
          class="flex flex-col items-center gap-3 py-10 px-4 text-center border-2 border-dashed border-border rounded-lg"
          data-testid="report-empty-state"
        >
          <div class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <LayoutGrid class="w-5 h-5" />
          </div>
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">No widgets yet</p>
            <p class="text-xs text-muted-foreground max-w-xs">
              Build the participant results page by adding widgets — score tiles, charts, or
              interpretive text — then drag them into place on the grid.
            </p>
          </div>
          <button
            onclick={addWidget}
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            data-testid="report-add-widget"
          >
            <Plus class="w-4 h-4" /> Add your first widget
          </button>
        </div>
      {:else if viewMode === 'preview'}
        <div class="border border-border rounded-lg bg-background overflow-hidden" data-testid="report-preview">
          <ReportPageView
            reportConfig={previewConfig}
            variables={previewData.variables}
            scoreConfigs={previewData.scoreConfigs}
            session={previewData.session}
            reportTitle={config.title}
          />
          <p class="text-[11px] text-muted-foreground text-center px-3 py-2 border-t border-border">
            Preview uses representative sample values — participants see their own results.
          </p>
        </div>
      {:else}
        <ReportGridEditor
          bind:widgets={config.widgets}
          columns={config.layout.columns}
          {typeLabels}
          bind:selectedId
        />

        {#each config.widgets as widget, i (widget.id)}
        <div
          id={`report-card-${widget.id}`}
          class="border rounded-lg p-3 space-y-2 bg-background {widget.id === selectedId ? 'border-primary ring-1 ring-primary' : 'border-border'}"
          data-testid={`report-widget-${i}`}
        >
          <div class="flex items-center gap-2">
            <Select
              value={widget.type}
              onchange={(e) => updateWidget(i, { type: e.currentTarget.value as ReportWidget['type'] })}
              placeholder=""
              class="text-sm"
            >
              {#each widgetTypes as t}
                <option value={t.value}>{t.label}</option>
              {/each}
            </Select>
            <div class="flex-1"></div>
            <button
              onclick={() => removeWidget(i)}
              class="p-1 rounded hover:bg-destructive/10 text-destructive/70 hover:text-destructive"
              aria-label="Remove widget"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Grid position (12 columns) -->
          <div class="grid grid-cols-4 gap-2">
            {#each posFields as [field, label]}
              <div>
                <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-${field}-${widget.id}`}>{label}</label>
                <input
                  id={`w-${field}-${widget.id}`}
                  type="number"
                  min="0"
                  max={field === 'x' || field === 'w' ? 12 : undefined}
                  value={widget.position[field]}
                  oninput={(e) => updatePosition(i, { [field]: Number(e.currentTarget.value) || 0 } as Partial<ReportWidget['position']>)}
                  class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
                />
              </div>
            {/each}
          </div>

          <!-- Binding -->
          {#if widget.type !== 'completion-meta' && widget.type !== 'interpretive-text'}
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-bsrc-${widget.id}`}>Bind to</label>
                <Select
                  id={`w-bsrc-${widget.id}`}
                  value={widget.binding.source}
                  onchange={(e) => updateBinding(i, { source: e.currentTarget.value as ReportWidget['binding']['source'], key: '' })}
                  placeholder=""
                  class="text-sm"
                >
                  <option value="variable">Variable</option>
                  <option value="score">Scale score</option>
                </Select>
              </div>
              <div>
                <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-bkey-${widget.id}`}>Key</label>
                <Select
                  id={`w-bkey-${widget.id}`}
                  value={widget.binding.key}
                  onchange={(e) => updateBinding(i, { key: e.currentTarget.value })}
                  placeholder=""
                  class="text-sm"
                >
                  <option value="">Select…</option>
                  {#each keyOptionsFor(widget.binding.source) as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </Select>
              </div>
              <div>
                <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-bfield-${widget.id}`}>Field</label>
                {#if widget.binding.source === 'score'}
                  <Select
                    id={`w-bfield-${widget.id}`}
                    value={widget.binding.field ?? 'value'}
                    onchange={(e) => updateBinding(i, { field: e.currentTarget.value })}
                    placeholder=""
                    class="text-sm"
                  >
                    {#each scoreFields as f}
                      <option value={f}>{f}</option>
                    {/each}
                  </Select>
                {:else}
                  <input
                    id={`w-bfield-${widget.id}`}
                    type="text"
                    value={widget.binding.field ?? ''}
                    oninput={(e) => updateBinding(i, { field: e.currentTarget.value || undefined })}
                    class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
                    placeholder="(optional)"
                  />
                {/if}
              </div>
            </div>
          {/if}

          <!-- Comparison (cohort band / norm) -->
          {#if widget.type === 'box-cohort' || widget.type === 'distribution-with-marker' || widget.type === 'bar' || widget.type === 'gauge' || widget.type === 'radar-profile'}
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-csrc-${widget.id}`}>Comparison</label>
                <Select
                  id={`w-csrc-${widget.id}`}
                  value={widget.comparison?.source ?? 'none'}
                  onchange={(e) => updateComparison(i, { source: e.currentTarget.value as NonNullable<ReportWidget['comparison']>['source'] })}
                  placeholder=""
                  class="text-sm"
                >
                  {#each comparisonSources as c}
                    <option value={c.value}>{c.label}</option>
                  {/each}
                </Select>
              </div>

              {#if widget.comparison?.source === 'server-variable'}
                <div>
                  <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-cserver-${widget.id}`}>Cohort server variable</label>
                  <Select
                    id={`w-cserver-${widget.id}`}
                    value={widget.comparison?.serverVariable ?? ''}
                    onchange={(e) => updateComparison(i, { serverVariable: e.currentTarget.value })}
                    placeholder=""
                    class="text-sm"
                  >
                    <option value="">Select object-typed server variable…</option>
                    {#each serverVariableOptions as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  </Select>
                </div>
              {:else if widget.comparison?.source === 'norm-table'}
                <div>
                  <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-cnorm-${widget.id}`}>Norm table</label>
                  <Select
                    id={`w-cnorm-${widget.id}`}
                    value={widget.comparison?.normTableId ?? ''}
                    onchange={(e) => updateComparison(i, { normTableId: e.currentTarget.value })}
                    placeholder=""
                    class="text-sm"
                  >
                    <option value="">Select norm…</option>
                    {#each normOptions as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  </Select>
                </div>
              {/if}

              {#if (widget.comparison?.source ?? 'none') !== 'none'}
                <div>
                  <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-cfallback-${widget.id}`}>Fallback</label>
                  <Select
                    id={`w-cfallback-${widget.id}`}
                    value={widget.comparison?.fallback ?? 'hide'}
                    onchange={(e) => updateComparison(i, { fallback: e.currentTarget.value as NonNullable<ReportWidget['comparison']>['fallback'] })}
                    placeholder=""
                    class="text-sm"
                  >
                    <option value="hide">Hide widget</option>
                    <option value="norm-table">Norm table</option>
                    <option value="message">Show message</option>
                  </Select>
                </div>
                {#if widget.comparison?.fallback === 'norm-table'}
                  <div>
                    <label class="block text-[11px] text-muted-foreground mb-0.5" for={`w-cfnorm-${widget.id}`}>Fallback norm</label>
                    <Select
                      id={`w-cfnorm-${widget.id}`}
                      value={widget.comparison?.fallbackNormTableId ?? ''}
                      onchange={(e) => updateComparison(i, { fallbackNormTableId: e.currentTarget.value })}
                      placeholder=""
                      class="text-sm"
                    >
                      <option value="">Select norm…</option>
                      {#each normOptions as opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                    </Select>
                  </div>
                {/if}
              {/if}
            </div>
          {/if}

          <!-- Free text (interpretive-text) -->
          {#if widget.type === 'interpretive-text'}
            <textarea
              value={widget.text ?? ''}
              oninput={(e) => updateWidget(i, { text: e.currentTarget.value })}
              rows="2"
              class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground resize-none"
              placeholder={'Narrative shown to the participant. Pipe values with {{score.anxiety.value}}.'}
            ></textarea>
          {/if}

          <!-- Interpretation note (optional, all data widgets) -->
          {#if widget.type !== 'interpretive-text' && widget.type !== 'completion-meta'}
            <input
              type="text"
              value={widget.interpretation ?? ''}
              oninput={(e) => updateWidget(i, { interpretation: e.currentTarget.value || undefined })}
              class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
              placeholder="Interpretation note (optional)"
            />
          {/if}
        </div>
        {/each}

        <button
          onclick={addWidget}
          class="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-primary hover:text-primary/80 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors"
          data-testid="report-add-widget"
        >
          <Plus class="w-4 h-4" /> Add Widget
        </button>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    <button
      onclick={cancel}
      class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Cancel
    </button>
    <button
      onclick={save}
      class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      data-testid="report-save"
    >
      Save
    </button>
  {/snippet}
</Dialog>
