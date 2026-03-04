<script lang="ts">
  import type { ReliabilityAnalysis } from '../types';

  interface Props {
    analysis: ReliabilityAnalysis | null;
  }

  let { analysis }: Props = $props();

  function alphaColor(alpha: number): string {
    if (alpha >= 0.9) return 'text-green-600 dark:text-green-400';
    if (alpha >= 0.8) return 'text-blue-600 dark:text-blue-400';
    if (alpha >= 0.7) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }

  function alphaLabel(alpha: number): string {
    if (alpha >= 0.9) return 'Excellent';
    if (alpha >= 0.8) return 'Good';
    if (alpha >= 0.7) return 'Acceptable';
    if (alpha >= 0.6) return 'Questionable';
    if (alpha >= 0.5) return 'Poor';
    return 'Unacceptable';
  }
</script>

{#if analysis}
  <div class="space-y-3 text-sm">
    <div class="text-center">
      <div class="text-3xl font-bold {alphaColor(analysis.cronbachAlpha)}">
        {analysis.cronbachAlpha.toFixed(3)}
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Cronbach's Alpha - {alphaLabel(analysis.cronbachAlpha)}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-x-6 gap-y-1">
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Mean r</span>
        <span class="font-medium text-gray-900 dark:text-white">
          {analysis.meanInterItemCorrelation.toFixed(3)}
        </span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Split-half</span>
        <span class="font-medium text-gray-900 dark:text-white">
          {analysis.splitHalfReliability.toFixed(3)}
        </span>
      </div>
    </div>

    {#if Object.keys(analysis.itemTotalCorrelations).length > 0}
      <div>
        <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
          Item-Total Correlations
        </div>
        <div class="space-y-0.5">
          {#each Object.entries(analysis.itemTotalCorrelations) as [item, corr]}
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">{item}</span>
              <span class="font-mono {corr < 0.3 ? 'text-red-500' : 'text-gray-900 dark:text-white'}">
                {corr.toFixed(3)}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="text-sm text-gray-400 dark:text-gray-500">No reliability data available</div>
{/if}
