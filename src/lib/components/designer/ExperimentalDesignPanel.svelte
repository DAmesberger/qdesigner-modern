<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { ExperimentalCondition, ExperimentalDesignConfig } from '$lib/shared';
  import { Plus, Trash2, FlaskConical, X } from 'lucide-svelte';

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  let design = $derived(
    designerStore.questionnaire.settings.experimentalDesign ?? {
      conditions: [],
      assignmentStrategy: 'random' as const,
      counterbalancing: 'none' as const,
      seed: undefined,
    }
  );

  let localConditions = $state<ExperimentalCondition[]>([]);
  let localStrategy = $state<ExperimentalDesignConfig['assignmentStrategy']>('random');
  let localCounterbalancing = $state<ExperimentalDesignConfig['counterbalancing']>('none');
  let localSeed = $state<string>('');

  $effect(() => {
    if (open) {
      localConditions = [...(design.conditions || [])];
      localStrategy = design.assignmentStrategy || 'random';
      localCounterbalancing = design.counterbalancing || 'none';
      localSeed = design.seed !== undefined ? String(design.seed) : '';
    }
  });

  function addCondition() {
    localConditions = [
      ...localConditions,
      { name: `Condition ${localConditions.length + 1}`, weight: 1 },
    ];
  }

  function removeCondition(index: number) {
    localConditions = localConditions.filter((_, i) => i !== index);
  }

  function updateConditionName(index: number, name: string) {
    localConditions = localConditions.map((c, i) => (i === index ? { ...c, name } : c));
  }

  function updateConditionWeight(index: number, weight: number) {
    localConditions = localConditions.map((c, i) =>
      i === index ? { ...c, weight: Math.max(0, weight) } : c
    );
  }

  function save() {
    const seedNum = localSeed ? parseInt(localSeed, 10) : undefined;

    if (localConditions.length === 0) {
      // Clear experimental design when no conditions defined
      designerStore.updateQuestionnaire({
        settings: {
          ...designerStore.questionnaire.settings,
          experimentalDesign: undefined,
        },
      });
    } else {
      designerStore.updateQuestionnaire({
        settings: {
          ...designerStore.questionnaire.settings,
          experimentalDesign: {
            conditions: localConditions,
            assignmentStrategy: localStrategy,
            counterbalancing: localCounterbalancing,
            seed: !isNaN(seedNum!) ? seedNum : undefined,
          },
        },
      });
    }

    open = false;
  }

  function cancel() {
    open = false;
  }

  const conditionCount = $derived(localConditions.length);
  const fullCounterbalancingWarning = $derived(
    localCounterbalancing === 'full' && conditionCount > 6
  );
</script>

{#if open}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-layer-modal rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-border"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <div class="flex items-center gap-2">
          <FlaskConical class="w-5 h-5 text-primary" />
          <h3 class="text-lg font-semibold text-foreground">Experimental Design</h3>
        </div>
        <button
          onclick={cancel}
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-6 space-y-6">
        <!-- Conditions -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-foreground">Conditions</span>
            <button
              onclick={addCondition}
              class="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus class="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {#if localConditions.length === 0}
            <p class="text-xs text-muted-foreground italic py-4 text-center">
              No conditions defined. Add conditions to enable between-subjects design.
            </p>
          {:else}
            <div class="space-y-2">
              {#each localConditions as condition, index (index)}
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    value={condition.name}
                    oninput={(e) => updateConditionName(index, e.currentTarget.value)}
                    class="flex-1 px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Condition name"
                  />
                  <div class="flex items-center gap-1">
                    <label for="cond-weight-{index}" class="text-xs text-muted-foreground whitespace-nowrap">Wt:</label>
                    <input
                      id="cond-weight-{index}"
                      type="number"
                      min="0"
                      step="0.1"
                      value={condition.weight}
                      oninput={(e) => updateConditionWeight(index, parseFloat(e.currentTarget.value) || 0)}
                      class="w-16 px-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button
                    onclick={() => removeCondition(index)}
                    class="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                    aria-label="Remove condition"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Assignment Strategy -->
        {#if localConditions.length > 0}
          <div>
            <label for="assignment-strategy" class="block text-sm font-medium text-foreground mb-1.5">
              Assignment Strategy
            </label>
            <select
              id="assignment-strategy"
              bind:value={localStrategy}
              class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
            >
              <option value="random">Random (weighted)</option>
              <option value="sequential">Sequential (round-robin)</option>
              <option value="balanced">Balanced (minimize group differences)</option>
            </select>
            <p class="text-xs text-muted-foreground mt-1">
              {#if localStrategy === 'random'}
                Participants are randomly assigned respecting condition weights.
              {:else if localStrategy === 'sequential'}
                Participants cycle through conditions in order.
              {:else}
                Assigns to the least-represented condition to maintain balance.
              {/if}
            </p>
          </div>

          <!-- Counterbalancing -->
          <div>
            <label for="counterbalancing" class="block text-sm font-medium text-foreground mb-1.5">
              Counterbalancing
            </label>
            <select
              id="counterbalancing"
              bind:value={localCounterbalancing}
              class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
            >
              <option value="none">None</option>
              <option value="latin-square">Latin Square</option>
              <option value="balanced-latin-square">Balanced Latin Square (Williams)</option>
              <option value="full">Full (all permutations)</option>
            </select>
            <p class="text-xs text-muted-foreground mt-1">
              {#if localCounterbalancing === 'none'}
                Blocks appear in the order defined in the designer.
              {:else if localCounterbalancing === 'latin-square'}
                Each condition appears in each position across participants.
              {:else if localCounterbalancing === 'balanced-latin-square'}
                Williams design: each condition follows every other condition exactly once.
              {:else}
                All possible orderings are used. Best for {'\u2264'}6 conditions.
              {/if}
            </p>
            {#if fullCounterbalancingWarning}
              <p class="text-xs text-amber-600 mt-1">
                Full counterbalancing with {conditionCount} conditions creates {conditionCount}! = {factorial(conditionCount)} orderings. Consider Latin Square instead.
              </p>
            {/if}
          </div>

          <!-- Seed -->
          <div>
            <label for="exp-seed" class="block text-sm font-medium text-foreground mb-1.5">
              Random Seed (optional)
            </label>
            <input
              id="exp-seed"
              type="text"
              bind:value={localSeed}
              class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
              placeholder="Leave blank for time-based seed"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Set a numeric seed for reproducible condition assignment.
            </p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 px-6 py-4 border-t border-border">
        <button
          onclick={cancel}
          class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={save}
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

<script lang="ts" module>
  function factorial(n: number): number {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }
</script>
