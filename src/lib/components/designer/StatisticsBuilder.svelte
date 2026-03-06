<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { Chart, registerables, type ChartType, type ChartConfiguration } from 'chart.js';
  import type { Variable } from '$lib/shared/types/questionnaire';
  import {
    ScientificChartBuilder,
    type ScientificChartType,
    type ScientificChartConfig,
  } from './ScientificChartConfig';
  import { Settings, BarChart2, LineChart, PieChart, Activity, BarChart } from 'lucide-svelte';

  Chart.register(...registerables);

  let {
    variableId = '',
    type = 'bar',
    title = '',
    showLegend = true,
    showGrid = true,
    normativeData = null,
  } = $props<{
    variableId?: string;
    type?: ScientificChartType;
    title?: string;
    showLegend?: boolean;
    showGrid?: boolean;
    normativeData?: any;
  }>();

  // State
  let chartCanvas = $state<HTMLCanvasElement>();
  let chart = $state<Chart | null>(null);
  let variables = $derived(designerStore.questionnaire.variables || []);
  let selectedVariables = $state<string[]>([]);
  let statisticsMode = $state<'single' | 'comparison' | 'normative'>('single');
  let showConfiguration = $state(false);

  // Chart configuration
  let chartConfig = {
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
    showMean: true,
    showSD: false,
    showCI: false,
    showPercentiles: false,
    animationDuration: 750,
  };

  // Initialize chart
  onMount(() => {
    if (chartCanvas && variableId) {
      createChart();
    }
  });

  // Cleanup
  onDestroy(() => {
    if (chart) {
      chart.destroy();
    }
  });

  // Create or update chart
  function createChart() {
    if (chart) {
      chart.destroy();
    }

    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;

    const chartData = generateChartData();

    // Use scientific chart builder for advanced configurations
    const scientificConfig: ScientificChartConfig = {
      type,
      title,
      showLegend,
      showGrid,
      showStatistics: chartConfig.showMean || chartConfig.showSD,
      normativeData,
      customOptions: {
        animation: {
          duration: chartConfig.animationDuration,
        },
      },
    };

    const config = ScientificChartBuilder.createConfiguration(type, chartData, scientificConfig);

    chart = new Chart(ctx, config);
  }

  // Map our scientific chart types to Chart.js base types
  function mapChartType(type: string): ChartType {
    switch (type) {
      case 'distribution':
        return 'line'; // Use line chart for smooth distribution curves
      case 'percentile':
        return 'line';
      case 'histogram':
        return 'bar';
      case 'boxplot':
        return 'bar'; // We'll customize this with error bars
      case 'scatter':
        return 'scatter';
      default:
        return type as ChartType;
    }
  }

  // Generate chart data based on selected variables and type
  function generateChartData() {
    const colors = chartConfig.colors;

    switch (type) {
      case 'bar':
      case 'line':
        return {
          labels: generateLabels(),
          datasets: selectedVariables.map((varId, index) => {
            const variable = variables.find((v) => v.name === varId);
            return {
              label: (variable as any)?.label || varId,
              data: generateMockData(varId),
              backgroundColor: colors[index % colors.length] + '33',
              borderColor: colors[index % colors.length],
              borderWidth: 2,
            };
          }),
        };

      case 'pie':
        return {
          labels: generateCategoryLabels(),
          datasets: [
            {
              data: generateCategoryData(),
              backgroundColor: colors.map((c) => c + '66'),
              borderColor: colors,
              borderWidth: 2,
            },
          ],
        };

      case 'radar':
        return {
          labels: generateDimensionLabels(),
          datasets: selectedVariables.map((varId, index) => ({
            label: varId,
            data: generateRadarData(varId),
            backgroundColor: colors[index % colors.length] + '33',
            borderColor: colors[index % colors.length],
            borderWidth: 2,
            pointBackgroundColor: colors[index % colors.length],
          })),
        };

      case 'distribution':
        return generateDistributionData();

      case 'percentile':
        return generatePercentileData();

      case 'histogram':
        return generateHistogramData();

      case 'boxplot':
        return generateBoxplotData();

      case 'scatter':
        return generateScatterData();

      default:
        return { labels: [], datasets: [] };
    }
  }

  // Generate chart options
  function generateChartOptions() {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: chartConfig.animationDuration,
      },
      plugins: {
        legend: {
          display: showLegend,
          position: 'top' as const,
        },
        title: {
          display: !!title,
          text: title,
          font: {
            size: 16,
          },
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y || context.parsed;
              return `${label}: ${value.toFixed(2)}`;
            },
          },
        },
      },
    };

    // Type-specific options
    switch (type) {
      case 'bar':
      case 'line':
      case 'distribution':
      case 'histogram':
        return {
          ...baseOptions,
          scales: {
            x: {
              grid: {
                display: showGrid,
              },
            },
            y: {
              grid: {
                display: showGrid,
              },
              beginAtZero: true,
            },
          },
        };

      case 'scatter':
        return {
          ...baseOptions,
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              grid: {
                display: showGrid,
              },
            },
            y: {
              type: 'linear',
              grid: {
                display: showGrid,
              },
            },
          },
        };

      case 'boxplot':
        return {
          ...baseOptions,
          scales: {
            x: {
              grid: {
                display: false,
              },
            },
            y: {
              grid: {
                display: showGrid,
              },
            },
          },
        };

      case 'radar':
        return {
          ...baseOptions,
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
            },
          },
        };

      case 'percentile':
        return {
          ...baseOptions,
          scales: {
            x: {
              title: {
                display: true,
                text: 'Percentile',
              },
            },
            y: {
              title: {
                display: true,
                text: 'Score',
              },
            },
          },
        };

      default:
        return baseOptions;
    }
  }

  // Helper functions for data generation (mock data for now)
  function generateLabels(): string[] {
    return ['Pre-test', 'Post-test', 'Follow-up'];
  }

  function generateCategoryLabels(): string[] {
    return ['Category A', 'Category B', 'Category C', 'Category D'];
  }

  function generateDimensionLabels(): string[] {
    return ['Dimension 1', 'Dimension 2', 'Dimension 3', 'Dimension 4', 'Dimension 5'];
  }

  function generateMockData(varId: string): number[] {
    return [Math.random() * 100, Math.random() * 100, Math.random() * 100];
  }

  function generateCategoryData(): number[] {
    return [25, 30, 20, 25];
  }

  function generateRadarData(varId: string): number[] {
    return Array(5)
      .fill(0)
      .map(() => Math.random() * 100);
  }

  function generateDistributionData() {
    const mean = 50;
    const sd = 15;
    const bins = 20;
    const data = [];

    for (let i = 0; i < bins; i++) {
      const x = (i / bins) * 100;
      const y = (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sd, 2));
      data.push({ x, y: y * 1000 });
    }

    return {
      labels: data.map((d) => d.x.toFixed(0)),
      datasets: [
        {
          label: 'Distribution',
          data: data.map((d) => d.y),
          backgroundColor: chartConfig.colors[0] + '33',
          borderColor: chartConfig.colors[0],
          borderWidth: 2,
          type: 'line',
          tension: 0.4,
        },
      ],
    };
  }

  function generatePercentileData() {
    const percentiles = [5, 10, 25, 50, 75, 90, 95];
    const scores = percentiles.map((p) => p + Math.random() * 10 - 5);

    return {
      labels: percentiles.map((p) => `${p}th`),
      datasets: [
        {
          label: 'Percentile Scores',
          data: scores,
          backgroundColor: chartConfig.colors[1] + '33',
          borderColor: chartConfig.colors[1],
          borderWidth: 2,
          tension: 0.3,
        },
      ],
    };
  }

  function generateHistogramData() {
    const bins = 15;
    const data = [];

    // Generate sample data with normal distribution
    for (let i = 0; i < bins; i++) {
      const binStart = i * 10;
      const binEnd = (i + 1) * 10;
      const frequency = Math.floor(Math.random() * 50) + 10;
      data.push({
        x: `${binStart}-${binEnd}`,
        y: frequency,
      });
    }

    return {
      labels: data.map((d) => d.x),
      datasets: [
        {
          label: 'Frequency',
          data: data.map((d) => d.y),
          backgroundColor: chartConfig.colors[2] + '66',
          borderColor: chartConfig.colors[2],
          borderWidth: 1,
        },
      ],
    };
  }

  function generateBoxplotData() {
    // Generate box plot data structure
    const categories = ['Group A', 'Group B', 'Group C', 'Group D'];
    const datasets: any[] = [];

    categories.forEach((cat, idx) => {
      const min = Math.random() * 20;
      const q1 = min + Math.random() * 20;
      const median = q1 + Math.random() * 20;
      const q3 = median + Math.random() * 20;
      const max = q3 + Math.random() * 20;

      datasets.push({
        label: cat,
        data: [
          {
            x: cat,
            y: [min, q1, median, q3, max],
          },
        ],
        backgroundColor: chartConfig.colors[idx % chartConfig.colors.length] + '33',
        borderColor: chartConfig.colors[idx % chartConfig.colors.length],
        borderWidth: 2,
      });
    });

    return {
      labels: categories,
      datasets,
    };
  }

  function generateScatterData() {
    const numPoints = 50;
    const datasets: any[] = [];

    // Generate multiple datasets for comparison
    for (let d = 0; d < 2; d++) {
      const data: { x: number; y: number }[] = [];
      for (let i = 0; i < numPoints; i++) {
        data.push({
          x: Math.random() * 100,
          y: Math.random() * 100 + d * 20, // Slight offset for second dataset
        });
      }

      datasets.push({
        label: `Dataset ${d + 1}`,
        data,
        backgroundColor: chartConfig.colors[d] + '66',
        borderColor: chartConfig.colors[d],
        pointRadius: 5,
        pointHoverRadius: 7,
      });
    }

    return {
      datasets,
    };
  }

  // Get custom plugins for scientific chart types
  function getCustomPlugins(type: string) {
    switch (type) {
      case 'boxplot':
        // Add custom rendering for box plots
        return [
          {
            id: 'boxplotRenderer',
            afterDatasetDraw: (chart: Chart) => {
              // Custom box plot rendering logic would go here
            },
          },
        ];
      case 'distribution':
        // Add normal curve overlay
        return [
          {
            id: 'normalCurve',
            afterDatasetDraw: (chart: Chart) => {
              // Add normal distribution curve overlay
            },
          },
        ];
      default:
        return [];
    }
  }

  // Add variable to chart
  function addVariable(varId: string) {
    if (!selectedVariables.includes(varId)) {
      selectedVariables = [...selectedVariables, varId];
      createChart();
    }
  }

  // Remove variable from chart
  function removeVariable(varId: string) {
    selectedVariables = selectedVariables.filter((v) => v !== varId);
    createChart();
  }

  // Update chart when configuration changes
  $effect(() => {
    if (chart && (type || showLegend || showGrid || chartConfig)) {
      createChart();
    }
  });
</script>

<div class="statistics-builder">
  <!-- Header -->
  <div class="builder-header">
    <h3 class="text-lg font-semibold text-foreground">Statistical Visualization</h3>
    <button onclick={() => (showConfiguration = !showConfiguration)} class="config-button">
      <Settings size={20} />
      Configure
    </button>
  </div>

  <!-- Configuration Panel -->
  {#if showConfiguration}
    <div class="config-panel">
      <!-- Chart Type -->
      <div class="config-section">
        <span class="config-label">Chart Type</span>
        <div class="chart-type-grid">
          {#each ['bar', 'line', 'pie', 'radar', 'scatter', 'distribution', 'percentile', 'histogram', 'boxplot'] as chartType}
            <button
              class="chart-type-button"
              class:active={type === chartType}
              onclick={() => {
                type = chartType as typeof type;
                createChart();
              }}
            >
              {#if chartType === 'bar'}
                <BarChart2 size={24} />
              {:else if chartType === 'line'}
                <LineChart size={24} />
              {:else if chartType === 'pie'}
                <PieChart size={24} />
              {:else if chartType === 'radar'}
                <Activity size={24} />
              {:else}
                <BarChart size={24} />
              {/if}
              <span>{chartType}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Variable Selection -->
      <div class="config-section">
        <span class="config-label">Variables</span>
        <div class="variable-list">
          {#each variables as variable}
            <label class="variable-item">
              <input
                type="checkbox"
                checked={selectedVariables.includes(variable.name)}
                onchange={(e) => {
                  if (e.currentTarget.checked) {
                    addVariable(variable.name);
                  } else {
                    removeVariable(variable.name);
                  }
                }}
              />
              <span>{(variable as any).label || variable.name}</span>
              {#if variable.type === 'number'}
                <span class="variable-type">numeric</span>
              {/if}
            </label>
          {/each}
        </div>
      </div>

      <!-- Display Options -->
      <div class="config-section">
        <span class="config-label">Display Options</span>
        <div class="options-grid">
          <label class="option-item">
            <input type="checkbox" bind:checked={showLegend} />
            <span>Show Legend</span>
          </label>
          <label class="option-item">
            <input type="checkbox" bind:checked={showGrid} />
            <span>Show Grid</span>
          </label>
          {#if type === 'distribution' || type === 'percentile'}
            <label class="option-item">
              <input type="checkbox" bind:checked={chartConfig.showMean} />
              <span>Show Mean</span>
            </label>
            <label class="option-item">
              <input type="checkbox" bind:checked={chartConfig.showSD} />
              <span>Show SD</span>
            </label>
          {/if}
        </div>
      </div>

      <!-- Chart Title -->
      <div class="config-section">
        <span class="config-label">Title</span>
        <input
          type="text"
          bind:value={title}
          placeholder="Enter chart title..."
          class="config-input"
        />
      </div>
    </div>
  {/if}

  <!-- Chart Canvas -->
  <div class="chart-container" class:with-config={showConfiguration}>
    {#if selectedVariables.length > 0}
      <canvas bind:this={chartCanvas}></canvas>
    {:else}
      <div class="empty-state">
        <BarChart2 size={48} class="text-muted-foreground" />
        <p class="text-muted-foreground mt-2">Select variables to visualize</p>
      </div>
    {/if}
  </div>

  <!-- Statistics Summary -->
  {#if selectedVariables.length > 0 && chartConfig.showMean}
    <div class="statistics-summary">
      <div class="stat-item">
        <span class="stat-label">Mean</span>
        <span class="stat-value">52.3</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">SD</span>
        <span class="stat-value">14.7</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">N</span>
        <span class="stat-value">156</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .statistics-builder {
    background: var(--color-card);
    border-radius: 0.5rem;
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .builder-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .config-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    color: var(--color-foreground);
    font-size: 0.875rem;
    transition: all 150ms;
  }

  .config-button:hover {
    background: var(--color-accent);
    border-color: var(--color-border);
  }

  .config-panel {
    padding: 1rem;
    background: var(--color-muted);
    border-bottom: 1px solid var(--color-border);
  }

  .config-section {
    margin-bottom: 1.5rem;
  }

  .config-section:last-child {
    margin-bottom: 0;
  }

  .config-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-foreground);
    margin-bottom: 0.5rem;
  }

  .chart-type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 0.5rem;
    max-width: 600px;
  }

  .chart-type-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    color: var(--color-muted-foreground);
    font-size: 0.75rem;
    transition: all 150ms;
  }

  .chart-type-button:hover {
    background: var(--color-accent);
    border-color: var(--color-border);
  }

  .chart-type-button.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-foreground);
  }

  .variable-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .variable-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 150ms;
  }

  .variable-item:hover {
    background: var(--color-accent);
  }

  .variable-type {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    background: var(--color-muted);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }

  .options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .option-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .config-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .chart-container {
    padding: 2rem;
    min-height: 400px;
    position: relative;
  }

  .chart-container.with-config {
    min-height: 300px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 300px;
  }

  .statistics-summary {
    display: flex;
    justify-content: center;
    gap: 2rem;
    padding: 1rem;
    background: var(--color-muted);
    border-top: 1px solid var(--color-border);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-foreground);
  }
</style>
