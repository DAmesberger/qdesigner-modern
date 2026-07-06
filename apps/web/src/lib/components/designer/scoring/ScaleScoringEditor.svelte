<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type {
    ScaleScoringDef,
    ScaleAggregation,
    ScaleMissingPolicy,
    Question,
  } from '$lib/shared';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  // Editable working copy of settings.scoring.scales, seeded whenever the dialog opens.
  let scales = $state<ScaleScoringDef[]>([]);

  function cloneScales(source: ScaleScoringDef[] | undefined): ScaleScoringDef[] {
    return (source ?? []).map((s) => ({
      ...s,
      itemIds: [...(s.itemIds ?? [])],
      reverseScoredItemIds: [...(s.reverseScoredItemIds ?? [])],
      norm: s.norm ? { ...s.norm } : undefined,
    }));
  }

  $effect(() => {
    if (open) {
      scales = cloneScales(designerStore.questionnaire.settings?.scoring?.scales);
    }
  });

  // All authored questions, ordered, with a readable label for the item multiselect.
  const questionOptions = $derived.by(() => {
    const questions = [...(designerStore.questionnaire.questions ?? [])].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
    return questions.map((q) => ({ id: q.id, label: questionLabel(q) }));
  });

  function questionLabel(q: Question): string {
    const display = (q as { display?: { prompt?: string; content?: string } }).display;
    const prompt = display?.prompt || display?.content;
    return q.name || (typeof prompt === 'string' && prompt.trim() ? prompt.trim() : q.id);
  }

  function newScaleId(): string {
    const existing = new Set(scales.map((s) => s.id));
    let candidate: string;
    do {
      candidate = `scale_${Math.random().toString(36).slice(2, 8)}`;
    } while (existing.has(candidate));
    return candidate;
  }

  function addScale(): void {
    scales = [
      ...scales,
      {
        id: newScaleId(),
        name: `Scale ${scales.length + 1}`,
        itemIds: [],
        reverseScoredItemIds: [],
        itemMin: 1,
        itemMax: 5,
        aggregation: 'sum',
        missingPolicy: 'available',
      },
    ];
  }

  function removeScale(index: number): void {
    scales = scales.filter((_, i) => i !== index);
  }

  function updateScale(index: number, patch: Partial<ScaleScoringDef>): void {
    scales = scales.map((s, i) => (i === index ? { ...s, ...patch } : s));
  }

  function toggleItem(index: number, questionId: string): void {
    const scale = scales[index];
    if (!scale) return;
    const has = scale.itemIds.includes(questionId);
    const itemIds = has
      ? scale.itemIds.filter((id) => id !== questionId)
      : [...scale.itemIds, questionId];
    // Dropping an item also drops it from the reverse set.
    const reverseScoredItemIds = has
      ? (scale.reverseScoredItemIds ?? []).filter((id) => id !== questionId)
      : scale.reverseScoredItemIds ?? [];
    updateScale(index, { itemIds, reverseScoredItemIds });
  }

  function toggleReverse(index: number, questionId: string): void {
    const scale = scales[index];
    if (!scale) return;
    const current = scale.reverseScoredItemIds ?? [];
    const reverseScoredItemIds = current.includes(questionId)
      ? current.filter((id) => id !== questionId)
      : [...current, questionId];
    updateScale(index, { reverseScoredItemIds });
  }

  function toggleNorm(index: number, enabled: boolean): void {
    updateScale(index, { norm: enabled ? { mean: 0, sd: 1 } : undefined });
  }

  function updateNorm(index: number, patch: Partial<NonNullable<ScaleScoringDef['norm']>>): void {
    const scale = scales[index];
    if (!scale?.norm) return;
    updateScale(index, { norm: { ...scale.norm, ...patch } });
  }

  const aggregations: Array<{ value: ScaleAggregation; label: string }> = [
    { value: 'sum', label: 'Sum' },
    { value: 'mean', label: 'Mean' },
  ];

  const missingPolicies: Array<{ value: ScaleMissingPolicy; label: string }> = [
    { value: 'available', label: 'Available items only' },
    { value: 'prorate', label: 'Prorate (scale up)' },
    { value: 'mean-impute', label: 'Mean impute (person mean)' },
    { value: 'listwise', label: 'Listwise (drop if any missing)' },
  ];

  function save(): void {
    // Persist through the existing settings round-trip. Empty scoring is stored as
    // `undefined` so a questionnaire with no scales carries no scoring key.
    const cleaned = cloneScales(scales).map((s) => ({
      ...s,
      reverseScoredItemIds:
        (s.reverseScoredItemIds ?? []).length > 0 ? s.reverseScoredItemIds : undefined,
    }));

    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        scoring: cleaned.length > 0 ? { scales: cleaned } : undefined,
      },
    });

    open = false;
  }

  function cancel(): void {
    open = false;
  }
</script>

<Dialog bind:open title="Scale Scoring" size="lg" onclose={cancel}>
  <div class="space-y-6" data-testid="scale-scoring-editor">
    <p class="text-xs text-muted-foreground">
      Define subscales scored deterministically at completion (offline-capable). Each scale
      is persisted as a <code>score.&lt;id&gt;</code> variable exposing value, T-score,
      percentile, z-score, stanine and band for feedback.
    </p>

    {#if questionOptions.length === 0}
      <p class="text-sm text-muted-foreground">Add questions before defining scales.</p>
    {/if}

    {#each scales as scale, scaleIdx (scale.id)}
      <div class="rounded-md border border-border p-3 space-y-3" data-testid={`scale-${scaleIdx}`}>
        <div class="flex items-center justify-between gap-2">
          <input
            type="text"
            value={scale.name}
            placeholder="Scale name"
            class="flex-1 px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
            data-testid={`scale-name-${scaleIdx}`}
            oninput={(e) => updateScale(scaleIdx, { name: (e.currentTarget as HTMLInputElement).value })}
          />
          <button
            type="button"
            class="text-xs text-destructive hover:underline"
            onclick={() => removeScale(scaleIdx)}
            data-testid={`scale-remove-${scaleIdx}`}
          >
            Remove
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label class="block text-xs text-foreground">
            Aggregation
            <select
              class="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
              value={scale.aggregation}
              onchange={(e) =>
                updateScale(scaleIdx, {
                  aggregation: (e.currentTarget as HTMLSelectElement).value as ScaleAggregation,
                })}
            >
              {#each aggregations as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </label>

          <label class="block text-xs text-foreground">
            Missing data
            <select
              class="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
              value={scale.missingPolicy}
              onchange={(e) =>
                updateScale(scaleIdx, {
                  missingPolicy: (e.currentTarget as HTMLSelectElement).value as ScaleMissingPolicy,
                })}
            >
              {#each missingPolicies as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </label>

          <label class="block text-xs text-foreground">
            Item min
            <input
              type="number"
              value={scale.itemMin}
              class="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
              oninput={(e) =>
                updateScale(scaleIdx, { itemMin: Number((e.currentTarget as HTMLInputElement).value) })}
            />
          </label>

          <label class="block text-xs text-foreground">
            Item max
            <input
              type="number"
              value={scale.itemMax}
              class="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
              oninput={(e) =>
                updateScale(scaleIdx, { itemMax: Number((e.currentTarget as HTMLInputElement).value) })}
            />
          </label>
        </div>

        <div>
          <p class="text-xs font-medium text-foreground mb-1">Items (check to include, R = reverse)</p>
          <div class="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {#each questionOptions as q}
              {@const included = scale.itemIds.includes(q.id)}
              <div class="flex items-center gap-2 px-2 py-1 text-sm">
                <label class="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={included}
                    onchange={() => toggleItem(scaleIdx, q.id)}
                  />
                  <span class="truncate text-foreground">{q.label}</span>
                </label>
                <label class="flex items-center gap-1 text-xs text-muted-foreground" class:opacity-40={!included}>
                  <input
                    type="checkbox"
                    disabled={!included}
                    checked={(scale.reverseScoredItemIds ?? []).includes(q.id)}
                    onchange={() => toggleReverse(scaleIdx, q.id)}
                  />
                  R
                </label>
              </div>
            {/each}
          </div>
        </div>

        <div>
          <label class="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={!!scale.norm}
              onchange={(e) => toggleNorm(scaleIdx, (e.currentTarget as HTMLInputElement).checked)}
              data-testid={`scale-norm-toggle-${scaleIdx}`}
            />
            Normative comparison (T-score / percentile / stanine)
          </label>

          {#if scale.norm}
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 mt-2">
              <label class="block text-xs text-foreground">
                Norm mean
                <input
                  type="number"
                  step="any"
                  value={scale.norm.mean}
                  class="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
                  oninput={(e) =>
                    updateNorm(scaleIdx, { mean: Number((e.currentTarget as HTMLInputElement).value) })}
                />
              </label>
              <label class="block text-xs text-foreground">
                Norm SD
                <input
                  type="number"
                  step="any"
                  value={scale.norm.sd}
                  class="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
                  oninput={(e) =>
                    updateNorm(scaleIdx, { sd: Number((e.currentTarget as HTMLInputElement).value) })}
                />
              </label>
              <label class="block text-xs text-foreground">
                Source (optional)
                <input
                  type="text"
                  value={scale.norm.source ?? ''}
                  class="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground"
                  oninput={(e) =>
                    updateNorm(scaleIdx, { source: (e.currentTarget as HTMLInputElement).value })}
                />
              </label>
            </div>
          {/if}
        </div>
      </div>
    {/each}

    <button
      type="button"
      class="text-sm text-primary hover:underline"
      onclick={addScale}
      data-testid="scale-add"
    >
      + Add scale
    </button>
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
      data-testid="scale-scoring-save"
    >
      Save
    </button>
  {/snippet}
</Dialog>
