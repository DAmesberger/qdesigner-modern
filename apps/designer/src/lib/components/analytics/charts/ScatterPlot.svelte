<script lang="ts">
  import BaseChart from './BaseChart.svelte';
  import type { RegressionResult } from '$lib/analytics/types';
  import type { ChartConfiguration } from 'chart.js';
  
  export let xData: number[] = [];
  export let yData: number[] = [];
  export let xLabel: string = 'X Variable';
  export let yLabel: string = 'Y Variable';
  export let title: string = 'Scatter Plot';
  export let regression: RegressionResult | null = null;
  export let showRegression: boolean = true;
  export let pointColor: string = 'rgba(59, 130, 246, 0.6)';
  export let regressionColor: string = 'rgb(239, 68, 68)';
  
  function prepareScatterData() {
    if (xData.length === 0 || yData.length === 0) return null;
    
    const minLength = Math.min(xData.length, yData.length);
    const points = xData.slice(0, minLength).map((x, i) => ({
      x,
      y: yData[i]
    }));
    
    return points;
  }
  
  function generateRegressionLine() {
    if (!regression || !showRegression) return null;
    
    const intercept = regression.coefficients.find(c => c.name === 'Intercept')?.value || 0;
    const slope = regression.coefficients.find(c => c.name === 'Slope')?.value || 0;
    
    const xMin = Math.min(...xData);
    const xMax = Math.max(...xData);
    
    return [
      { x: xMin, y: intercept + slope * xMin },
      { x: xMax, y: intercept + slope * xMax }
    ];
  }
  
  $: scatterPoints = prepareScatterData();
  $: regressionLine = generateRegressionLine();
  
  $: chartConfig = scatterPoints ? ({
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Data Points',
          data: scatterPoints,
          backgroundColor: pointColor,
          borderColor: pointColor.replace('0.6', '1'),
          borderWidth: 1,
          pointRadius: 5,
          pointHoverRadius: 7
        },
        ...(regressionLine ? [{
          label: `Regression Line (R² = ${regression?.rSquared.toFixed(3)})`,
          data: regressionLine,
          type: 'line' as const,
          backgroundColor: 'transparent',
          borderColor: regressionColor,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          showLine: true
        }] : [])
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: title,
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        legend: {
          display: true,
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.dataset.label === 'Data Points') {
                return `(${context.parsed.x.toFixed(3)}, ${context.parsed.y.toFixed(3)})`;
              }
              return context.dataset.label || '';
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: {
            display: true,
            text: xLabel,
            font: {
              size: 14
            }
          }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: yLabel,
            font: {
              size: 14
            }
          }
        }
      }
    }
  } as ChartConfiguration) : null;
</script>

<div class="scatter-plot-container">
  {#if chartConfig}
    <BaseChart config={chartConfig} />
    
    {#if regression && showRegression}
      <div class="regression-info">
        <h4>Regression Statistics</h4>
        <div class="stats-grid">
          <div class="stat">
            <span class="label">R²</span>
            <span class="value">{regression.rSquared.toFixed(4)}</span>
          </div>
          <div class="stat">
            <span class="label">Adjusted R²</span>
            <span class="value">{regression.adjustedRSquared.toFixed(4)}</span>
          </div>
          <div class="stat">
            <span class="label">F-statistic</span>
            <span class="value">{regression.fStatistic.toFixed(2)}</span>
          </div>
          <div class="stat">
            <span class="label">p-value</span>
            <span class="value">{regression.fPValue.toFixed(4)}</span>
          </div>
        </div>
        
        <div class="equation">
          <span class="label">Equation:</span>
          <span class="value">
            y = {regression.coefficients.find(c => c.name === 'Intercept')?.value.toFixed(3)} 
            + {regression.coefficients.find(c => c.name === 'Slope')?.value.toFixed(3)}x
          </span>
        </div>
      </div>
    {/if}
  {:else}
    <div class="no-data">
      <p>No data available for scatter plot</p>
    </div>
  {/if}
</div>

<style>
  .scatter-plot-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .no-data {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 400px;
    background: var(--color-gray-50);
    border: 2px dashed var(--color-gray-300);
    border-radius: 0.5rem;
  }
  
  .no-data p {
    margin: 0;
    color: var(--color-gray-600);
    font-size: 0.875rem;
  }
  
  .regression-info {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    padding: 1rem;
  }
  
  .regression-info h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .stat .label,
  .equation .label {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    font-weight: 500;
  }
  
  .stat .value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .equation {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-gray-200);
  }
  
  .equation .value {
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
</style>