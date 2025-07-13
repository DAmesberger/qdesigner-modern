<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { designerStore } from '$lib/stores/designerStore';
  import { Chart, registerables } from 'chart.js';
  import type { Variable } from '$lib/shared/types/questionnaire';
  
  Chart.register(...registerables);
  
  export let variableId: string = '';
  export let type: 'bar' | 'line' | 'pie' | 'radar' | 'distribution' | 'percentile' = 'bar';
  export let title: string = '';
  export let showLegend: boolean = true;
  export let showGrid: boolean = true;
  export let normativeData: any = null;
  
  // State
  let chartCanvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  let variables: Variable[] = [];
  let selectedVariables: string[] = [];
  let statisticsMode: 'single' | 'comparison' | 'normative' = 'single';
  let showConfiguration = false;
  
  // Chart configuration
  let chartConfig = {
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
    showMean: true,
    showSD: false,
    showCI: false,
    showPercentiles: false,
    animationDuration: 750
  };
  
  // Subscribe to variables
  const unsubscribe = designerStore.subscribe(state => {
    variables = state.questionnaire.variables;
  });
  
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
    unsubscribe();
  });
  
  // Create or update chart
  function createChart() {
    if (chart) {
      chart.destroy();
    }
    
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;
    
    const chartData = generateChartData();
    const chartOptions = generateChartOptions();
    
    chart = new Chart(ctx, {
      type: mapChartType(type),
      data: chartData,
      options: chartOptions
    });
  }
  
  // Map our types to Chart.js types
  function mapChartType(type: string): any {
    switch (type) {
      case 'distribution':
        return 'bar';
      case 'percentile':
        return 'line';
      default:
        return type;
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
            const variable = variables.find(v => v.name === varId);
            return {
              label: (variable as any)?.label || varId,
              data: generateMockData(varId),
              backgroundColor: colors[index % colors.length] + '33',
              borderColor: colors[index % colors.length],
              borderWidth: 2
            };
          })
        };
        
      case 'pie':
        return {
          labels: generateCategoryLabels(),
          datasets: [{
            data: generateCategoryData(),
            backgroundColor: colors.map(c => c + '66'),
            borderColor: colors,
            borderWidth: 2
          }]
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
            pointBackgroundColor: colors[index % colors.length]
          }))
        };
        
      case 'distribution':
        return generateDistributionData();
        
      case 'percentile':
        return generatePercentileData();
        
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
        duration: chartConfig.animationDuration
      },
      plugins: {
        legend: {
          display: showLegend,
          position: 'top' as const
        },
        title: {
          display: !!title,
          text: title,
          font: {
            size: 16
          }
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y || context.parsed;
              return `${label}: ${value.toFixed(2)}`;
            }
          }
        }
      }
    };
    
    // Type-specific options
    switch (type) {
      case 'bar':
      case 'line':
      case 'distribution':
        return {
          ...baseOptions,
          scales: {
            x: {
              grid: {
                display: showGrid
              }
            },
            y: {
              grid: {
                display: showGrid
              },
              beginAtZero: true
            }
          }
        };
        
      case 'radar':
        return {
          ...baseOptions,
          scales: {
            r: {
              beginAtZero: true,
              max: 100
            }
          }
        };
        
      case 'percentile':
        return {
          ...baseOptions,
          scales: {
            x: {
              title: {
                display: true,
                text: 'Percentile'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Score'
              }
            }
          }
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
    return [
      Math.random() * 100,
      Math.random() * 100,
      Math.random() * 100
    ];
  }
  
  function generateCategoryData(): number[] {
    return [25, 30, 20, 25];
  }
  
  function generateRadarData(varId: string): number[] {
    return Array(5).fill(0).map(() => Math.random() * 100);
  }
  
  function generateDistributionData() {
    const mean = 50;
    const sd = 15;
    const bins = 20;
    const data = [];
    
    for (let i = 0; i < bins; i++) {
      const x = (i / bins) * 100;
      const y = (1 / (sd * Math.sqrt(2 * Math.PI))) * 
                Math.exp(-0.5 * Math.pow((x - mean) / sd, 2));
      data.push({ x, y: y * 1000 });
    }
    
    return {
      labels: data.map(d => d.x.toFixed(0)),
      datasets: [{
        label: 'Distribution',
        data: data.map(d => d.y),
        backgroundColor: chartConfig.colors[0] + '33',
        borderColor: chartConfig.colors[0],
        borderWidth: 2,
        type: 'line',
        tension: 0.4
      }]
    };
  }
  
  function generatePercentileData() {
    const percentiles = [5, 10, 25, 50, 75, 90, 95];
    const scores = percentiles.map(p => p + Math.random() * 10 - 5);
    
    return {
      labels: percentiles.map(p => `${p}th`),
      datasets: [{
        label: 'Percentile Scores',
        data: scores,
        backgroundColor: chartConfig.colors[1] + '33',
        borderColor: chartConfig.colors[1],
        borderWidth: 2,
        tension: 0.3
      }]
    };
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
    selectedVariables = selectedVariables.filter(v => v !== varId);
    createChart();
  }
  
  // Update chart when configuration changes
  $: if (chart && (type || showLegend || showGrid || chartConfig)) {
    createChart();
  }
</script>

<div class="statistics-builder">
  <!-- Header -->
  <div class="builder-header">
    <h3 class="text-lg font-semibold text-gray-900">Statistical Visualization</h3>
    <button
      on:click={() => showConfiguration = !showConfiguration}
      class="config-button"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Configure
    </button>
  </div>
  
  <!-- Configuration Panel -->
  {#if showConfiguration}
    <div class="config-panel">
      <!-- Chart Type -->
      <div class="config-section">
        <label class="config-label">Chart Type</label>
        <div class="chart-type-grid">
          {#each ['bar', 'line', 'pie', 'radar', 'distribution', 'percentile'] as chartType}
            <button
              class="chart-type-button"
              class:active={type === chartType as any}
              on:click={() => { type = chartType; createChart(); }}
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {#if chartType === 'bar'}
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                {:else if chartType === 'line'}
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
                {:else if chartType === 'pie'}
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                {:else if chartType === 'radar'}
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                {:else}
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                {/if}
              </svg>
              <span>{chartType}</span>
            </button>
          {/each}
        </div>
      </div>
      
      <!-- Variable Selection -->
      <div class="config-section">
        <label class="config-label">Variables</label>
        <div class="variable-list">
          {#each variables as variable}
            <label class="variable-item">
              <input
                type="checkbox"
                checked={selectedVariables.includes(variable.name)}
                on:change={(e) => {
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
        <label class="config-label">Display Options</label>
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
        <label class="config-label">Title</label>
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
        <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-gray-500 mt-2">Select variables to visualize</p>
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
    background: white;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }
  
  .builder-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .config-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    color: #374151;
    font-size: 0.875rem;
    transition: all 150ms;
  }
  
  .config-button:hover {
    background: #e5e7eb;
    border-color: #d1d5db;
  }
  
  .config-panel {
    padding: 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
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
    color: #374151;
    margin-bottom: 0.5rem;
  }
  
  .chart-type-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  
  .chart-type-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    color: #6b7280;
    font-size: 0.75rem;
    transition: all 150ms;
  }
  
  .chart-type-button:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
  
  .chart-type-button.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
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
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 150ms;
  }
  
  .variable-item:hover {
    background: #f9fafb;
  }
  
  .variable-type {
    margin-left: auto;
    font-size: 0.75rem;
    color: #9ca3af;
    background: #f3f4f6;
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
    border: 1px solid #d1d5db;
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
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
  }
  
  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .stat-label {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
  }
</style>