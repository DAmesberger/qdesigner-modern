<script lang="ts">
  interface FunnelStep {
    label: string;
    count: number;
  }

  interface Props {
    steps: FunnelStep[];
  }

  let { steps }: Props = $props();

  const maxCount = $derived(steps.length > 0 ? Math.max(...steps.map(s => s.count), 1) : 1);
</script>

{#if steps.length > 0}
  <div class="space-y-2">
    {#each steps as step, i}
      {@const pct = (step.count / maxCount) * 100}
      {@const dropoff = i > 0 && steps[i - 1]
        ? ((steps[i - 1]!.count - step.count) / steps[i - 1]!.count * 100)
        : 0}
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-gray-700 dark:text-gray-300 truncate">{step.label}</span>
          <span class="text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
            {step.count}
            {#if i > 0 && dropoff > 0}
              <span class="text-red-500 dark:text-red-400">(-{dropoff.toFixed(0)}%)</span>
            {/if}
          </span>
        </div>
        <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
          <div
            class="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style="width: {pct}%;"
          ></div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="text-sm text-gray-400 dark:text-gray-500">No funnel data available</div>
{/if}
