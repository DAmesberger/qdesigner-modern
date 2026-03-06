<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { DataQualitySettings } from '$lib/shared';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  let settings = $derived(
    designerStore.questionnaire.settings.dataQuality ?? {
      minPageTimeMs: 2000,
      minTotalTimeMs: 0,
      flatlineThreshold: 0.8,
      attentionFailureThreshold: 1,
    }
  );

  let localMinPageTime = $state(2000);
  let localMinTotalTime = $state(0);
  let localFlatlineThreshold = $state(0.8);
  let localAttentionFailures = $state(1);

  $effect(() => {
    if (open) {
      localMinPageTime = settings.minPageTimeMs ?? 2000;
      localMinTotalTime = settings.minTotalTimeMs ?? 0;
      localFlatlineThreshold = settings.flatlineThreshold ?? 0.8;
      localAttentionFailures = settings.attentionFailureThreshold ?? 1;
    }
  });

  function save() {
    const dq: DataQualitySettings = {
      minPageTimeMs: localMinPageTime,
      minTotalTimeMs: localMinTotalTime > 0 ? localMinTotalTime : undefined,
      flatlineThreshold: localFlatlineThreshold,
      attentionFailureThreshold: localAttentionFailures,
    };

    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        dataQuality: dq,
      },
    });

    open = false;
  }

  function cancel() {
    open = false;
  }
</script>

<Dialog bind:open={open} title="Data Quality Settings" size="md" onclose={cancel}>
  <div class="space-y-6">
        <!-- Speeder Detection -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Speeder Detection</h4>
          <div class="space-y-3">
            <div>
              <label for="dq-min-page-time" class="block text-sm text-foreground mb-1">
                Minimum page time (ms)
              </label>
              <input
                id="dq-min-page-time"
                type="number"
                min="0"
                step="500"
                bind:value={localMinPageTime}
                class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                data-testid="dq-min-page-time"
              />
              <p class="text-xs text-muted-foreground mt-1">
                Flag pages where the respondent spent less than this time. Set to 0 to disable.
              </p>
            </div>

            <div>
              <label for="dq-min-total-time" class="block text-sm text-foreground mb-1">
                Minimum total time (ms)
              </label>
              <input
                id="dq-min-total-time"
                type="number"
                min="0"
                step="1000"
                bind:value={localMinTotalTime}
                class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                data-testid="dq-min-total-time"
              />
              <p class="text-xs text-muted-foreground mt-1">
                Flag the entire session if completed faster than this. Set to 0 to disable.
              </p>
            </div>
          </div>
        </div>

        <!-- Flatline Detection -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Flatline Detection</h4>
          <div>
            <label for="dq-flatline-threshold" class="block text-sm text-foreground mb-1">
              Threshold (0-1)
            </label>
            <input
              id="dq-flatline-threshold"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={localFlatlineThreshold}
              class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
              data-testid="dq-flatline-threshold"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Flag blocks where this fraction or more of responses match a repetitive pattern (same answer, alternating, or sequential).
            </p>
          </div>
        </div>

        <!-- Attention Checks -->
        <div>
          <h4 class="text-sm font-medium text-foreground mb-3">Attention Checks</h4>
          <div>
            <label for="dq-attention-failures" class="block text-sm text-foreground mb-1">
              Failure threshold
            </label>
            <input
              id="dq-attention-failures"
              type="number"
              min="1"
              step="1"
              bind:value={localAttentionFailures}
              class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
              data-testid="dq-attention-failures"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Number of failed attention checks before flagging the session. Mark individual questions as attention checks in their Advanced Settings.
            </p>
          </div>
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
      data-testid="dq-save"
    >
      Save
    </button>
  {/snippet}
</Dialog>
