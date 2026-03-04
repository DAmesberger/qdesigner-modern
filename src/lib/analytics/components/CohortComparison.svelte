<script lang="ts">
  import type { StatisticalSummary } from '../types';
  import DescriptiveStatsWidget from './DescriptiveStatsWidget.svelte';

  interface CohortData {
    label: string;
    stats: StatisticalSummary | null;
    n: number;
  }

  interface Props {
    cohortA: CohortData;
    cohortB: CohortData;
    /** Optional effect size (Cohen's d) between the two cohorts */
    effectSize?: number | null;
    /** Optional p-value from a comparison test */
    pValue?: number | null;
  }

  let { cohortA, cohortB, effectSize = null, pValue = null }: Props = $props();

  function significanceLabel(p: number): string {
    if (p < 0.001) return '***';
    if (p < 0.01) return '**';
    if (p < 0.05) return '*';
    return 'ns';
  }

  function effectSizeLabel(d: number): string {
    const abs = Math.abs(d);
    if (abs >= 0.8) return 'Large';
    if (abs >= 0.5) return 'Medium';
    if (abs >= 0.2) return 'Small';
    return 'Negligible';
  }
</script>

<div class="space-y-4">
  <!-- Comparison Header -->
  {#if effectSize !== null || pValue !== null}
    <div class="flex items-center justify-center gap-4 py-2 px-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      {#if effectSize !== null}
        <div class="text-center">
          <div class="text-sm font-medium text-gray-900 dark:text-white">
            d = {effectSize.toFixed(3)}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {effectSizeLabel(effectSize)} effect
          </div>
        </div>
      {/if}
      {#if pValue !== null}
        <div class="text-center">
          <div class="text-sm font-medium text-gray-900 dark:text-white">
            p = {pValue < 0.001 ? '< .001' : pValue.toFixed(3)}
            <span class="text-xs {pValue < 0.05 ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}">
              {significanceLabel(pValue)}
            </span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {pValue < 0.05 ? 'Significant' : 'Not significant'}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Side-by-side panels -->
  <div class="grid grid-cols-2 gap-4">
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
          {cohortA.label}
        </h4>
        <span class="text-xs text-gray-500 dark:text-gray-400">n = {cohortA.n}</span>
      </div>
      <DescriptiveStatsWidget stats={cohortA.stats} label="" />
    </div>

    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
          {cohortB.label}
        </h4>
        <span class="text-xs text-gray-500 dark:text-gray-400">n = {cohortB.n}</span>
      </div>
      <DescriptiveStatsWidget stats={cohortB.stats} label="" />
    </div>
  </div>
</div>
