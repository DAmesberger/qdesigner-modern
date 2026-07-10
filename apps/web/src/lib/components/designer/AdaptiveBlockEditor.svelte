<script lang="ts">
  /**
   * Adaptive (CAT/IRT) block editor (E-FLOW-1, step 8). Edits the block-level stopping
   * rule + exposure control and the per-item 3PL calibration (a/b/c) plus an optional
   * correctness key that maps a raw answer to the boolean the CAT update consumes.
   *
   * Mutates the passed `config` object in place (it is a reference into the block being
   * edited); array fields are reassigned so Svelte reactivity fires on the parent state.
   */
  import type { AdaptiveBlockConfig, CATItem, AdaptiveItemScoring, Question } from '$lib/shared';
  import {
    validateAdaptiveBlock,
    issueFor,
  } from '$lib/components/designer/validation/scientificRules';

  let {
    config,
    questionIds,
    allQuestions,
  }: {
    config: AdaptiveBlockConfig;
    questionIds: string[];
    allQuestions: Question[];
  } = $props();

  // Inline IRT-parameter sanity checks (R4-4): a > 0 (typically 0.2–3),
  // b in −4..4, c in [0,1) (≤ 0.35 by convention), plus stopping-rule bounds.
  const issues = $derived(
    validateAdaptiveBlock({
      maxItems: config.maxItems,
      seThreshold: config.seThreshold,
      exposureControl: config.exposureControl,
      exposureTopK: config.exposureTopK,
      items: (config.items ?? []).map((it) => ({ id: it.id, a: it.a, b: it.b, c: it.c })),
      questionIds,
    })
  );
  const errorFields = $derived(
    new Set(issues.filter((i) => i.severity === 'error').map((i) => i.field))
  );

  function questionLabel(id: string): string {
    const q = allQuestions.find((question) => question.id === id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- display config is a union hole
    return (q?.display as any)?.prompt || q?.name || id;
  }

  function itemFor(id: string): CATItem {
    return (config.items ?? []).find((item) => item.id === id) ?? { id, a: 1, b: 0, c: 0 };
  }

  function patchItem(id: string, patch: Partial<CATItem>): void {
    const list = config.items ?? [];
    const existing = list.find((item) => item.id === id);
    const next: CATItem = { ...(existing ?? { id, a: 1, b: 0, c: 0 }), ...patch, id };
    config.items = [...list.filter((item) => item.id !== id), next];
  }

  function scoringFor(id: string): AdaptiveItemScoring | undefined {
    return config.scoring?.find((rule) => rule.questionId === id);
  }

  function patchScoring(id: string, patch: Partial<AdaptiveItemScoring>): void {
    const list = config.scoring ?? [];
    const existing = list.find((rule) => rule.questionId === id);
    const merged: AdaptiveItemScoring = { ...(existing ?? { questionId: id }), ...patch, questionId: id };
    // Drop an all-empty rule so we don't persist noise.
    const isEmpty = merged.correctValue === undefined && merged.threshold === undefined;
    const rest = list.filter((rule) => rule.questionId !== id);
    config.scoring = isEmpty ? rest : [...rest, merged];
  }

  function numberOrUndefined(raw: string): number | undefined {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }
</script>

{#snippet fieldMsg(field: string)}
  {@const issue = issueFor(issues, field)}
  {#if issue}
    <p
      class="mt-1 text-xs {issue.severity === 'error' ? 'text-destructive' : 'text-warning'}"
      role={issue.severity === 'error' ? 'alert' : undefined}
    >
      {issue.message}
    </p>
  {/if}
{/snippet}

<div class="border-t border-border pt-4 space-y-4">
  <div>
    <h4 class="text-sm font-medium text-foreground mb-1">Adaptive (CAT/IRT) settings</h4>
    <p class="text-xs text-muted-foreground">
      This block's questions form a calibrated item bank. The runtime administers them
      adaptively — selecting the most informative item at the running ability estimate and
      stopping once the standard error target or item cap is reached. The estimate is
      written to the <code>theta</code> / <code>thetaSE</code> session variables.
    </p>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div>
      <label for="adaptive-max-items" class="block text-sm text-muted-foreground mb-1">Max items</label>
      <input
        id="adaptive-max-items"
        type="number"
        min="1"
        value={config.maxItems ?? ''}
        oninput={(e) => (config.maxItems = numberOrUndefined(e.currentTarget.value))}
        class="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary {errorFields.has('maxItems') ? 'border-destructive' : 'border-border'}"
        placeholder="30"
      />
      {@render fieldMsg('maxItems')}
    </div>
    <div>
      <label for="adaptive-se" class="block text-sm text-muted-foreground mb-1">SE threshold</label>
      <input
        id="adaptive-se"
        type="number"
        min="0"
        step="0.05"
        value={config.seThreshold ?? ''}
        oninput={(e) => (config.seThreshold = numberOrUndefined(e.currentTarget.value))}
        class="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary {errorFields.has('seThreshold') ? 'border-destructive' : 'border-border'}"
        placeholder="0.3"
      />
      {@render fieldMsg('seThreshold')}
    </div>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div>
      <label for="adaptive-exposure" class="block text-sm text-muted-foreground mb-1">Exposure control</label>
      <select
        id="adaptive-exposure"
        value={config.exposureControl ?? 'none'}
        onchange={(e) => (config.exposureControl = e.currentTarget.value as 'none' | 'randomesque')}
        class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
      >
        <option value="none">None (maximum information)</option>
        <option value="randomesque">Randomesque (top-k)</option>
      </select>
    </div>
    {#if config.exposureControl === 'randomesque'}
      <div>
        <label for="adaptive-topk" class="block text-sm text-muted-foreground mb-1">Top-k pool</label>
        <input
          id="adaptive-topk"
          type="number"
          min="1"
          value={config.exposureTopK ?? ''}
          oninput={(e) => (config.exposureTopK = numberOrUndefined(e.currentTarget.value))}
          class="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary {errorFields.has('exposureTopK') ? 'border-destructive' : 'border-border'}"
          placeholder="3"
        />
        {@render fieldMsg('exposureTopK')}
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div>
      <label for="adaptive-report-var" class="block text-sm text-muted-foreground mb-1">
        Report variable (optional)
      </label>
      <input
        id="adaptive-report-var"
        type="text"
        value={config.thetaReportVariable ?? ''}
        oninput={(e) => (config.thetaReportVariable = e.currentTarget.value || undefined)}
        class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
        placeholder="e.g., abilityEstimate"
      />
    </div>
    <div>
      <label for="adaptive-bank-id" class="block text-sm text-muted-foreground mb-1">
        Item bank id (optional)
      </label>
      <input
        id="adaptive-bank-id"
        type="text"
        value={config.itemBankId ?? ''}
        oninput={(e) => (config.itemBankId = e.currentTarget.value || undefined)}
        class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
        placeholder="e.g., anxiety-bank-v1"
      />
    </div>
  </div>

  <!-- Per-item calibration -->
  <div class="border-t border-border/60 pt-3">
    <h5 class="text-sm font-medium text-foreground mb-2">Item calibration (3PL)</h5>
    {#if questionIds.length === 0}
      <p class="text-xs text-muted-foreground/70 italic">
        Add questions to this block, then set each item's a / b / c parameters here.
      </p>
    {:else}
      <div class="space-y-2">
        <div class="grid grid-cols-[1fr_repeat(4,minmax(0,4rem))] gap-2 text-[11px] text-muted-foreground">
          <span>Item</span>
          <span title="Discrimination">a</span>
          <span title="Difficulty">b</span>
          <span title="Guessing">c</span>
          <span title="Correct answer value (optional scoring key)">key</span>
        </div>
        {#each questionIds as id (id)}
          {@const item = itemFor(id)}
          {@const scoring = scoringFor(id)}
          <div class="grid grid-cols-[1fr_repeat(4,minmax(0,4rem))] gap-2 items-center">
            <span class="text-xs truncate" title={questionLabel(id)}>{questionLabel(id)}</span>
            <input
              type="number"
              step="0.1"
              value={item.a}
              oninput={(e) => patchItem(id, { a: numberOrUndefined(e.currentTarget.value) ?? 1 })}
              class="px-1.5 py-1 border rounded bg-background text-foreground text-xs {errorFields.has(`item.${id}.a`) ? 'border-destructive' : 'border-border'}"
              aria-label={`Discrimination for ${id}`}
            />
            <input
              type="number"
              step="0.1"
              value={item.b}
              oninput={(e) => patchItem(id, { b: numberOrUndefined(e.currentTarget.value) ?? 0 })}
              class="px-1.5 py-1 border rounded bg-background text-foreground text-xs {errorFields.has(`item.${id}.b`) ? 'border-destructive' : 'border-border'}"
              aria-label={`Difficulty for ${id}`}
            />
            <input
              type="number"
              step="0.05"
              value={item.c ?? 0}
              oninput={(e) => patchItem(id, { c: numberOrUndefined(e.currentTarget.value) ?? 0 })}
              class="px-1.5 py-1 border rounded bg-background text-foreground text-xs {errorFields.has(`item.${id}.c`) ? 'border-destructive' : 'border-border'}"
              aria-label={`Guessing for ${id}`}
            />
            <input
              type="text"
              value={scoring?.correctValue ?? ''}
              oninput={(e) => {
                const raw = e.currentTarget.value.trim();
                const asNum = numberOrUndefined(raw);
                patchScoring(id, {
                  correctValue: raw === '' ? undefined : (asNum ?? raw),
                });
              }}
              class="px-1.5 py-1 border border-border rounded bg-background text-foreground text-xs"
              aria-label={`Correct value for ${id}`}
              placeholder="—"
            />
          </div>
          {@render fieldMsg(`item.${id}.a`)}
          {@render fieldMsg(`item.${id}.b`)}
          {@render fieldMsg(`item.${id}.c`)}
        {/each}
      </div>
      <p class="text-[11px] text-muted-foreground/70 mt-2">
        The correctness key maps a raw answer to 0/1 for the ability update. Leave blank to
        fall back to the question's own custom-correctness rule.
      </p>
    {/if}
  </div>
</div>
