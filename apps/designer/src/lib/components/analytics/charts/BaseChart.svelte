<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Chart from 'chart.js/auto';
  import type { ChartConfiguration, ChartType } from 'chart.js';
  
  export let config: ChartConfiguration;
  export let width: string = '100%';
  export let height: string = '400px';
  export let responsive: boolean = true;
  export let maintainAspectRatio: boolean = false;
  
  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  
  function createChart() {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Merge default options with provided config
    const chartConfig: ChartConfiguration = {
      ...config,
      options: {
        responsive,
        maintainAspectRatio,
        ...config.options,
        plugins: {
          ...config.options?.plugins,
          legend: {
            position: 'bottom',
            ...config.options?.plugins?.legend
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            titleFont: {
              size: 14,
              weight: 'bold'
            },
            bodyFont: {
              size: 13
            },
            ...config.options?.plugins?.tooltip
          }
        }
      }
    };
    
    chart = new Chart(ctx, chartConfig);
  }
  
  function updateChart() {
    if (!chart) return;
    
    // Update data
    if (config.data) {
      chart.data = config.data;
    }
    
    // Update options
    if (config.options) {
      chart.options = {
        ...chart.options,
        ...config.options
      };
    }
    
    chart.update();
  }
  
  function destroyChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }
  
  onMount(() => {
    createChart();
  });
  
  onDestroy(() => {
    destroyChart();
  });
  
  // Reactive updates
  $: if (chart && config) {
    updateChart();
  }
</script>

<div class="chart-container" style="width: {width}; height: {height};">
  <canvas bind:this={canvas} />
</div>

<style>
  .chart-container {
    position: relative;
  }
  
  canvas {
    width: 100% !important;
    height: 100% !important;
  }
</style>