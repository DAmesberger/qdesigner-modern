<script lang="ts">
  import BaseAnalytics from '../shared/analytics/BaseAnalytics.svelte';
  import type { AnalyticsProps } from '../shared/analytics/types';
  import type { Question } from '$lib/shared';
  import { Chart, registerables } from 'chart.js';
  import { untrack, tick } from 'svelte';
  import { scriptingEngine } from '$lib/services/scriptingEngine';

  // Register all Chart.js components
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
    value?: string; // Value expression to evaluate
    referenceValue?: string; // Reference value expression
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
    analytics: Question & {
      config: BarChartConfig;
      dataSource?: {
        variables: any[];
        aggregation: string;
      };
    };
  }

  let { analytics, mode = 'runtime', variables = {}, onInteraction }: Props = $props();

  // Ensure analytics has dataSource (do this outside of reactive context)
  if (!analytics.dataSource) {
    analytics.dataSource = {
      variables: [],
      aggregation: 'none',
    };
  }

  let chartCanvas = $state<HTMLCanvasElement>();
  let chart: Chart | null = null;
  let lastChartData: any[] = [];

  const config = $derived(analytics.config);
  const isHorizontal = $derived(config.orientation === 'horizontal');

  // Color schemes
  const colorSchemes = {
    default: [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
    ],
    categorical: [
      '#1f77b4',
      '#ff7f0e',
      '#2ca02c',
      '#d62728',
      '#9467bd',
      '#8c564b',
      '#e377c2',
      '#7f7f7f',
    ],
    sequential: ['#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
    diverging: ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641'],
  };

  // Evaluate expression using scripting engine
  async function evaluateExpression(expression: string): Promise<number | null> {
    if (!expression) return null;

    try {
      // Check if it's a simple number
      const num = parseFloat(expression);
      if (!isNaN(num)) return num;

      // Check if it's a variable reference
      if (expression.startsWith('{{') && expression.endsWith('}}')) {
        const varName = expression.slice(2, -2).trim();
        const value = variables[varName];
        return typeof value === 'number' ? value : null;
      }

      // Try direct variable name
      if (variables[expression] !== undefined) {
        const value = variables[expression];
        return typeof value === 'number' ? value : null;
      }

      // Otherwise evaluate as expression
      const result = await scriptingEngine.evaluate(expression, variables);
      return typeof result === 'number' ? result : null;
    } catch (error) {
      console.error('Error evaluating expression:', expression, error);
      return null;
    }
  }

  // Prepare chart data
  async function prepareChartData(data: any[]) {
    console.log('[BarChart] prepareChartData called with data:', data);
    console.log('[BarChart] config:', config);
    console.log('[BarChart] analytics.dataSource:', analytics.dataSource);
    console.log('[BarChart] variables passed to component:', variables);
    const datasets = [];
    const labels = [];

    // If we have a value expression, use that instead of variable data
    if (config.value) {
      const value = await evaluateExpression(config.value);
      const refValue = config.referenceValue
        ? await evaluateExpression(config.referenceValue)
        : null;

      console.log('[BarChart] Using expression values:', { value, refValue });

      if (value !== null) {
        if (isHorizontal) {
          // For horizontal bar chart, we want single bars
          labels.push('Value');
          const currentData = [value];

          datasets.push({
            label: 'Current',
            data: currentData,
            backgroundColor: getColor(0),
            borderColor: getColor(0),
            borderWidth: 1,
          });

          if (refValue !== null) {
            labels.push('Reference');
            datasets[0].data.push(refValue);
          }
        } else {
          // For vertical bar chart
          labels.push('Value');
          datasets.push({
            label: 'Current',
            data: [value],
            backgroundColor: getColor(0),
            borderColor: getColor(0),
            borderWidth: 1,
          });

          if (refValue !== null) {
            datasets.push({
              label: 'Reference',
              data: [refValue],
              backgroundColor: getColor(1),
              borderColor: getColor(1),
              borderWidth: 1,
            });
          }
        }
      }

      return { labels, datasets };
    }

    // Process data from variables
    if (data && data.length > 0) {
      console.log('[BarChart] Processing variable data, first item:', data[0]);

      // For horizontal bar chart with single variable
      if (isHorizontal && data.length === 1) {
        const item = data[0];
        labels.push(item.id || 'Variable');
        datasets.push({
          label: 'Value',
          data: [item.value || 0],
          backgroundColor: getColor(0),
          borderColor: getColor(0),
          borderWidth: 1,
        });
      } else if (isHorizontal) {
        // Multiple variables in horizontal layout
        data.forEach((item, index) => {
          labels.push(item.id || `Variable ${index + 1}`);
        });
        datasets.push({
          label: 'Values',
          data: data.map((d) => d.value || 0),
          backgroundColor: data.map((_, i) => getColor(i)),
          borderColor: data.map((_, i) => getColor(i)),
          borderWidth: 1,
        });
      } else {
        // Vertical bar chart
        const firstItem = data[0];

        // For simple single values, use the variable name/id as label
        if (firstItem && typeof firstItem.value === 'number') {
          // Simple numeric values - most common case for variables
          labels.push(...data.map((d) => d.id || 'Variable'));
          datasets.push({
            label: 'Value',
            data: data.map((d) => d.value || 0),
            backgroundColor: data.map((_, i) => getColor(i)),
            borderColor: data.map((_, i) => getColor(i)),
            borderWidth: 1,
          });
        } else if (firstItem && Array.isArray(firstItem.value)) {
          // Multiple series data
          labels.push(...firstItem.value.map((_, i) => `Item ${i + 1}`));

          data.forEach((item, index) => {
            datasets.push({
              label: item.id,
              data: item.value,
              backgroundColor: getColor(index),
              borderColor: getColor(index),
              borderWidth: 1,
            });
          });
        } else if (firstItem && typeof firstItem.value === 'object' && firstItem.value !== null) {
          // Object data - keys as labels
          const keys = Object.keys(firstItem.value);
          labels.push(...keys);

          data.forEach((item, index) => {
            const values = keys.map((k) => item.value[k] || 0);
            datasets.push({
              label: item.id,
              data: values,
              backgroundColor: getColor(index),
              borderColor: getColor(index),
              borderWidth: 1,
            });
          });
        } else {
          // Simple values
          labels.push(...data.map((d) => d.id));
          datasets.push({
            label: 'Values',
            data: data.map((d) => d.value || 0),
            backgroundColor: data.map((_, i) => getColor(i)),
            borderColor: data.map((_, i) => getColor(i)),
            borderWidth: 1,
          });
        }
      }
    }

    // Add error bars if enabled
    if (config.showErrorBars && datasets.length > 0) {
      datasets.forEach((dataset) => {
        dataset.errorBars = calculateErrorBars(dataset.data, config.errorType);
      });
    }

    // If no data at all, return placeholder
    if (datasets.length === 0) {
      console.log('[BarChart] No data available, showing placeholder');
      labels.push('No Data');
      datasets.push({
        label: 'No Data',
        data: [0],
        backgroundColor: '#e5e7eb',
        borderColor: '#e5e7eb',
        borderWidth: 1,
      });
    }

    console.log('[BarChart] Final chart data:', { labels, datasets });
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
        return data.map(() => (1.96 * stdDev) / Math.sqrt(data.length));
      default:
        return data.map(() => 0);
    }
  }

  // Get color from scheme
  function getColor(index: number): string {
    const scheme =
      config.colors.customColors.length > 0
        ? config.colors.customColors
        : colorSchemes[config.colors.scheme] || colorSchemes.default;

    return scheme[index % scheme.length];
  }

  // Effect to handle chart lifecycle and data updates
  $effect(() => {
    console.log('[BarChart] Effect triggered', {
      hasCanvas: !!chartCanvas,
      mode,
      hasChart: !!chart,
      dataSourceVariables: analytics.dataSource?.variables,
      configValue: config.value,
      variables,
    });

    // Only proceed if canvas is available and in the right mode
    if (!chartCanvas || (mode !== 'runtime' && mode !== 'preview' && mode !== 'edit')) {
      return;
    }

    // Get the current data from BaseAnalytics (passed via snippet)
    // We'll update this when the data prop changes
    const updateChart = async () => {
      await createOrUpdateChart([]);
    };

    // Initial creation
    if (!chart) {
      updateChart();
    }

    // Cleanup on unmount
    return () => {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    };
  });

  // Create or update chart
  async function createOrUpdateChart(data: any[]) {
    if (!chartCanvas) return;

    // Destroy existing chart if it exists
    if (chart) {
      chart.destroy();
      chart = null;
    }

    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;

    // Use provided data or create placeholder data
    const chartData = data && data.length > 0 ? data : [];
    const { labels, datasets } = await prepareChartData(chartData);

    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: isHorizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: analytics.visualization?.showLegend ?? true,
            position: 'top',
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
              },
            },
          },
          datalabels: config.showDataLabels
            ? {
                display: true,
                anchor: 'end',
                align: 'end',
                formatter: (value) => (config.showValues ? value : ''),
              }
            : { display: false },
        },
        scales: {
          x: {
            display: true,
            stacked: config.stacked,
            grid: {
              display: config.axes.x.showGrid,
            },
            ticks: {
              display: config.axes.x.showTicks,
            },
            title: {
              display: !!config.axes.x.label,
              text: config.axes.x.label,
            },
          },
          y: {
            display: true,
            stacked: config.stacked,
            grid: {
              display: config.axes.y.showGrid,
            },
            ticks: {
              display: config.axes.y.showTicks,
            },
            title: {
              display: !!config.axes.y.label,
              text: config.axes.y.label,
            },
            min: config.axes.y.min === 'auto' ? undefined : config.axes.y.min,
            max: config.axes.y.max === 'auto' ? undefined : config.axes.y.max,
          },
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
                value: chart?.data.datasets[element.datasetIndex].data[element.index],
              },
            });
          }
        },
      },
    });
  }
  // Action to handle chart data updates from snippet
  function chartDataAction(node: HTMLElement, data: any[]) {
    $effect(() => {
      console.log('[BarChart Snippet] Received data from BaseAnalytics:', data);
      // Handle data updates
      if (chartCanvas && data !== lastChartData) {
        lastChartData = data;
        requestAnimationFrame(() => {
          createOrUpdateChart(data || []);
        });
      }
    });
  }
</script>

<BaseAnalytics {analytics} {mode} {variables} {onInteraction}>
  {#snippet children({ data })}
    <div class="bar-chart" data-has-data={data && data.length > 0} use:chartDataAction={data}>
      {#if mode === 'edit'}
        <!-- In edit mode, show a preview chart if we have variables selected -->
        {#if analytics.dataSource?.variables?.length > 0 || config.value}
          <canvas bind:this={chartCanvas} class="chart-canvas"></canvas>
          {#if chartCanvas}
            <!-- Chart updates are handled via $effect -->
          {/if}
        {:else}
          <div class="edit-placeholder">
            <span class="placeholder-icon">📊</span>
            <p>Bar Chart</p>
            <p class="placeholder-info">Select variables to display</p>
          </div>
        {/if}
      {:else if mode === 'runtime' || mode === 'preview'}
        <canvas bind:this={chartCanvas} class="chart-canvas"></canvas>
        {#if chartCanvas}
          <!-- Chart updates are handled via $effect -->
        {/if}
      {/if}
    </div>
  {/snippet}
</BaseAnalytics>

<style>
  .bar-chart {
    width: 100%;
    height: 300px; /* Fixed height */
    position: relative;
    overflow: hidden; /* Prevent expansion */
    transition: none; /* Disable transitions that might cause glitches */
  }

  .chart-canvas {
    width: 100%;
    height: 100%;
    display: block; /* Ensure block display */
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
    height: 300px; /* Fixed height to match canvas */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #f9fafb;
    border-radius: 0.5rem;
  }

  /* Override BaseAnalytics container styles */
  :global(.analytics-block .visualization-container) {
    min-height: unset !important;
    height: auto !important;
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
