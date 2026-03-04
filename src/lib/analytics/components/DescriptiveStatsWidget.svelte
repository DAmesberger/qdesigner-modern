<script lang="ts">
  import type { StatisticalSummary } from '../types';

  interface Props {
    stats: StatisticalSummary | null;
    label?: string;
  }

  let { stats, label = 'Summary' }: Props = $props();

  function fmt(n: number): string {
    return Number.isFinite(n) ? n.toFixed(2) : '--';
  }
</script>

{#if stats}
  <div class="space-y-3 text-sm">
    {#if label}
      <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
    {/if}
    <div class="grid grid-cols-2 gap-x-6 gap-y-2">
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">N</span>
        <span class="font-medium text-gray-900 dark:text-white">{stats.count}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Mean</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.mean)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Median</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.median)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">SD</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.standardDeviation)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Min</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.min)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Max</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.max)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Q1</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.quartiles.q1)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Q3</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.quartiles.q3)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Skewness</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.skewness)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">Kurtosis</span>
        <span class="font-medium text-gray-900 dark:text-white">{fmt(stats.kurtosis)}</span>
      </div>
    </div>
    {#if stats.outliers.length > 0}
      <div class="text-xs text-amber-600 dark:text-amber-400">
        {stats.outliers.length} outlier{stats.outliers.length > 1 ? 's' : ''} detected
      </div>
    {/if}
  </div>
{:else}
  <div class="text-sm text-gray-400 dark:text-gray-500">No data available</div>
{/if}
