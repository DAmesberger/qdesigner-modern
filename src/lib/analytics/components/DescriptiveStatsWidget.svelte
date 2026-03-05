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
      <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
    {/if}
    <div class="grid grid-cols-2 gap-x-6 gap-y-2">
      <div class="flex justify-between">
        <span class="text-muted-foreground">N</span>
        <span class="font-medium text-foreground">{stats.count}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Mean</span>
        <span class="font-medium text-foreground">{fmt(stats.mean)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Median</span>
        <span class="font-medium text-foreground">{fmt(stats.median)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">SD</span>
        <span class="font-medium text-foreground">{fmt(stats.standardDeviation)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Min</span>
        <span class="font-medium text-foreground">{fmt(stats.min)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Max</span>
        <span class="font-medium text-foreground">{fmt(stats.max)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Q1</span>
        <span class="font-medium text-foreground">{fmt(stats.quartiles.q1)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Q3</span>
        <span class="font-medium text-foreground">{fmt(stats.quartiles.q3)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Skewness</span>
        <span class="font-medium text-foreground">{fmt(stats.skewness)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Kurtosis</span>
        <span class="font-medium text-foreground">{fmt(stats.kurtosis)}</span>
      </div>
    </div>
    {#if stats.outliers.length > 0}
      <div class="text-xs text-warning">
        {stats.outliers.length} outlier{stats.outliers.length > 1 ? 's' : ''} detected
      </div>
    {/if}
  </div>
{:else}
  <div class="text-sm text-muted-foreground">No data available</div>
{/if}
