<script lang="ts">
  import BaseAnalytics from '../shared/BaseAnalytics.svelte';
  import type { AnalyticsProps } from '../shared/types';
  import type { Question } from '$lib/shared';
  import { Chart, registerables } from 'chart.js';
  import { untrack, tick } from 'svelte';
  
  // Register Chart.js components
  Chart.register(...registerables);
  
  interface BarChartConfig {
    orientation: 'vertical' | 'horizontal';
    showErrorBars: boolean;
    errorType: 'standardError' | 'standardDeviation' | 'confidence95';
    stacked: boolean;
    showValues: boolean;
    showDataLabels: boolean;
    barWidth: number;
    barSpacing: number;
    colors: {
      scheme: string;
      customColors: string[];
    };
    axes: {
      x: {
        label: string;
        showGrid: boolean;
        showTicks: boolean;
      };
      y: {
        label: string;
        showGrid: boolean;
        showTicks: boolean;
        min: 'auto' | number;
        max: 'auto' | number;
      };
    };
  }
  
  interface Props extends AnalyticsProps {
    analytics: Question & { config: BarChartConfig };
  }
  
  let {
    analytics,
    mode = 'runtime',
    variables = {},
    onInteraction
  }: Props = $props();
  
  let chartCanvas = $state<HTMLCanvasElement>();
  let chart: Chart | null = null;
  
  const config = $derived(analytics.config);
  const isHorizontal = $derived(config.orientation === 'horizontal');
  
  // Color schemes
  const colorSchemes = {
    default: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],
    categorical: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'],
    sequential: ['#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
    diverging: ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641']
  };
  
  // Prepare chart data
  function prepareChartData(data: any[]) {
    const datasets = [];
    const labels = [];
    
    // Process data based on structure
    if (data && data.length > 0) {
      // Check if data is grouped
      const firstItem = data[0];
      
      // For simple single values, use the variable name/id as label
      if (firstItem && typeof firstItem.value === 'number') {
        // Simple numeric values - most common case for variables
        labels.push(...data.map(d => d.id || 'Variable'));
        datasets.push({
          label: 'Value',
          data: data.map(d => d.value || 0),
          backgroundColor: data.map((_, i) => getColor(i)),
          borderColor: data.map((_, i) => getColor(i)),
          borderWidth: 1
        });
      } else if (Array.isArray(firstItem.value)) {
        // Multiple series data
        labels.push(...firstItem.value.map((_, i) => `Item ${i + 1}`));
        
        data.forEach((item, index) => {
          datasets.push({
            label: item.id,
            data: item.value,
            backgroundColor: getColor(index),
            borderColor: getColor(index),
            borderWidth: 1
          });
        });
      } else if (typeof firstItem.value === 'object' && firstItem.value !== null) {
        // Object data - keys as labels
        const keys = Object.keys(firstItem.value);
        labels.push(...keys);
        
        data.forEach((item, index) => {
          const values = keys.map(k => item.value[k] || 0);
          datasets.push({
            label: item.id,
            data: values,
            backgroundColor: getColor(index),
            borderColor: getColor(index),
            borderWidth: 1
          });
        });
      } else {
        // Simple values
        labels.push(...data.map(d => d.id));
        datasets.push({
          label: 'Values',
          data: data.map(d => d.value),
          backgroundColor: data.map((_, i) => getColor(i)),
          borderColor: data.map((_, i) => getColor(i)),
          borderWidth: 1
        });
      }
    }
    
    // Add error bars if enabled
    if (config.showErrorBars && datasets.length > 0) {
      datasets.forEach(dataset => {
        dataset.errorBars = calculateErrorBars(dataset.data, config.errorType);
      });
    }
    
    return { labels, datasets };
  }
  
  // Calculate error bars
  function calculateErrorBars(data: number[], type: string): number[] {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const stdDev = Math.sqrt(variance);
    
    switch (type) {
      case 'standardError':
        return data.map(() => stdDev / Math.sqrt(data.length));
      case 'standardDeviation':
        return data.map(() => stdDev);
      case 'confidence95':
        return data.map(() => 1.96 * stdDev / Math.sqrt(data.length));
      default:
        return data.map(() => 0);
    }
  }
  
  // Get color from scheme
  function getColor(index: number): string {
    const scheme = config.colors.customColors.length > 0 
      ? config.colors.customColors 
      : colorSchemes[config.colors.scheme] || colorSchemes.default;
    
    return scheme[index % scheme.length];
  }
  

  

  

  
  // Action to initialize chart when canvas is ready
  function initChart(node: HTMLCanvasElement, data: any[]) {
    chartCanvas = node;
    // Create chart when we have data or show placeholder
    if (data && data.length > 0) {
      setTimeout(() => createChart(data), 0);
    } else {
      // Create empty chart with placeholder
      setTimeout(() => createChart([{ id: 'No Data', value: 0 }]), 0);
    }
    
    return {
      update(newData: any[]) {
        if (newData && newData.length > 0) {
          createChart(newData);
        } else {
          createChart([{ id: 'No Data', value: 0 }]);
        }
      },
      destroy() {
        if (chart) {
          chart.destroy();
          chart = null;
        }
      }
    };
  }
  
  // Cleanup chart on unmount
  $effect(() => {
    return () => {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    };
  });
  
  function createChart(chartData: any) {
    if (chart) {
      chart.destroy();
    }
    
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;
    
    const { labels, datasets } = prepareChartData(chartData);
    
    chart = new Chart(ctx, {
      type: isHorizontal ? 'bar' : 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: isHorizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: analytics.visualization?.showLegend ?? true,
            position: 'top'
          },
          tooltip: {
            enabled: analytics.visualization?.showTooltips ?? true,
            callbacks: {
              label: (context) => {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                label += context.parsed.y;
                
                if (config.showErrorBars && context.dataset.errorBars) {
                  const error = context.dataset.errorBars[context.dataIndex];
                  label += ` ± ${error.toFixed(2)}`;
                }
                
                return label;
              }
            }
          },
          datalabels: config.showDataLabels ? {
            display: true,
            anchor: 'end',
            align: 'end',
            formatter: (value) => config.showValues ? value : ''
          } : { display: false }
        },
        scales: {
          x: {
            display: true,
            stacked: config.stacked,
            grid: {
              display: config.axes.x.showGrid
            },
            ticks: {
              display: config.axes.x.showTicks
            },
            title: {
              display: !!config.axes.x.label,
              text: config.axes.x.label
            }
          },
          y: {
            display: true,
            stacked: config.stacked,
            grid: {
              display: config.axes.y.showGrid
            },
            ticks: {
              display: config.axes.y.showTicks
            },
            title: {
              display: !!config.axes.y.label,
              text: config.axes.y.label
            },
            min: config.axes.y.min === 'auto' ? undefined : config.axes.y.min,
            max: config.axes.y.max === 'auto' ? undefined : config.axes.y.max
          }
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const element = elements[0];
            onInteraction?.({
              type: 'click',
              timestamp: Date.now(),
              data: {
                datasetIndex: element.datasetIndex,
                index: element.index,
                value: chart?.data.datasets[element.datasetIndex].data[element.index]
              }
            });
          }
        }
      }
    });
  }
</script>

<BaseAnalytics
  {analytics}
  {mode}
  {variables}
  {onInteraction}
>
  {#snippet children({ data })}
  <div class="bar-chart">
    {#if mode === 'runtime'}
      <canvas bind:this={chartCanvas} class="chart-canvas" use:initChart={data}></canvas>
    {:else if mode === 'preview'}
      <div class="preview-container">
        <svg viewBox="0 0 400 300" class="preview-svg">
          <!-- Simple bar chart preview -->
          <rect x="50" y="200" width="60" height="80" fill="#3b82f6" opacity="0.8" />
          <rect x="130" y="150" width="60" height="130" fill="#10b981" opacity="0.8" />
          <rect x="210" y="170" width="60" height="110" fill="#f59e0b" opacity="0.8" />
          <rect x="290" y="140" width="60" height="140" fill="#8b5cf6" opacity="0.8" />
          
          {#if config.showErrorBars}
            <!-- Error bars -->
            <line x1="80" y1="190" x2="80" y2="210" stroke="#374151" stroke-width="2" />
            <line x1="75" y1="190" x2="85" y2="190" stroke="#374151" stroke-width="2" />
            <line x1="75" y1="210" x2="85" y2="210" stroke="#374151" stroke-width="2" />
          {/if}
          
          <!-- Axes -->
          <line x1="40" y1="280" x2="360" y2="280" stroke="#e5e7eb" stroke-width="2" />
          <line x1="40" y1="280" x2="40" y2="20" stroke="#e5e7eb" stroke-width="2" />
          
          {#if config.axes.y.showGrid}
            <line x1="40" y1="100" x2="360" y2="100" stroke="#f3f4f6" stroke-width="1" />
            <line x1="40" y1="150" x2="360" y2="150" stroke="#f3f4f6" stroke-width="1" />
            <line x1="40" y1="200" x2="360" y2="200" stroke="#f3f4f6" stroke-width="1" />
            <line x1="40" y1="250" x2="360" y2="250" stroke="#f3f4f6" stroke-width="1" />
          {/if}
        </svg>
        <p class="preview-text">Bar chart visualization</p>
      </div>
    {:else}
      <div class="edit-placeholder">
        <span class="placeholder-icon">📊</span>
        <p>Bar Chart</p>
        <p class="placeholder-info">{analytics.dataSource.variables.length} variables</p>
      </div>
    {/if}
  </div>
  {/snippet}
</BaseAnalytics>

<style>
  .bar-chart {
    width: 100%;
    height: 100%;
    min-height: 300px;
    position: relative;
  }
  
  .chart-canvas {
    width: 100%;
    height: 100%;
  }
  
  .preview-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  
  .preview-svg {
    width: 100%;
    max-width: 400px;
    height: auto;
  }
  
  .preview-text {
    margin-top: 1rem;
    color: #6b7280;
    font-size: 0.875rem;
  }
  
  .edit-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #f9fafb;
    border-radius: 0.5rem;
  }
  
  .placeholder-icon {
    font-size: 3rem;
    margin-bottom: 0.5rem;
  }
  
  .edit-placeholder p {
    margin: 0.25rem 0;
    color: #374151;
    font-weight: 500;
  }
  
  .placeholder-info {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 400;
  }
</style>