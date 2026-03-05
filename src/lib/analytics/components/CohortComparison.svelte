<script lang="ts">
  import type { StatisticalSummary } from '../types';
  import DescriptiveStatsWidget from './DescriptiveStatsWidget.svelte';
  import {
    Chart,
    CategoryScale,
    LinearScale,
    BarElement,
    BarController,
    Title,
    Tooltip,
    Legend,
  } from 'chart.js';

  Chart.register(CategoryScale, LinearScale, BarElement, BarController, Title, Tooltip, Legend);

  interface CohortData {
    label: string;
    stats: StatisticalSummary | null;
    n: number;
  }

  interface Props {
    cohortA: CohortData;
    cohortB: CohortData;
    effectSize?: number | null;
    pValue?: number | null;
  }

  let { cohortA, cohortB, effectSize = null, pValue = null }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let chartInstance: Chart | undefined;

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

  $effect(() => {
    if (!canvasEl || !cohortA.stats || !cohortB.stats) return;
    chartInstance?.destroy();

    const metrics = ['Mean', 'Median', 'Std Dev'];
    const aVals = [cohortA.stats.mean, cohortA.stats.median, cohortA.stats.standardDeviation];
    const bVals = [cohortB.stats.mean, cohortB.stats.median, cohortB.stats.standardDeviation];

    chartInstance = new Chart(canvasEl, {
      type: 'bar',
      data: {
        labels: metrics,
        datasets: [
          {
            label: cohortA.label,
            data: aVals,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: '#3B82F6',
            borderWidth: 2,
            borderRadius: 6,
          },
          {
            label: cohortB.label,
            data: bVals,
            backgroundColor: 'rgba(139, 92, 246, 0.55)',
            borderColor: '#8B5CF6',
            borderWidth: 2,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#334155', font: { size: 11, weight: 'bold' } },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.15)', drawTicks: false },
            ticks: { color: '#94a3b8', font: { size: 11 }, padding: 8 },
            border: { display: false },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, pointStyle: 'rectRounded', padding: 16, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            bodyFont: { size: 13 },
            padding: { x: 12, y: 8 },
            cornerRadius: 8,
          },
        },
      } as any,
    });

    return () => {
      chartInstance?.destroy();
      chartInstance = undefined;
    };
  });
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

  <!-- Chart visualization -->
  {#if cohortA.stats && cohortB.stats}
    <div class="h-[200px]">
      <canvas bind:this={canvasEl}></canvas>
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
