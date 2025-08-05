<script lang="ts">
  import BaseChart from './BaseChart.svelte';
  import type { DescriptiveStats } from '$lib/analytics/types';
  import type { ChartConfiguration } from 'chart.js';
  
  export let stats: DescriptiveStats[] = [];
  export let labels: string[] = [];
  export let title: string = 'Box Plot Comparison';
  export let showOutliers: boolean = true;
  
  function calculateBoxPlotData(stat: DescriptiveStats) {
    return {
      min: stat.min,
      q1: stat.percentiles.p25,
      median: stat.median,
      q3: stat.percentiles.p75,
      max: stat.max,
      mean: stat.mean,
      outliers: [] // Would need actual data points to calculate
    };
  }
  
  $: chartData = (() => {
    if (stats.length === 0) return null;
    
    const boxPlotData = stats.map(stat => calculateBoxPlotData(stat));
    
    return {
      labels: labels.length ? labels : stats.map((_, i) => `Group ${i + 1}`),
      datasets: [
        {
          label: 'Distribution',
          data: boxPlotData.map(d => [d.min, d.q1, d.median, d.q3, d.max]),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
          outlierBackgroundColor: 'rgb(239, 68, 68)',
          outlierBorderColor: 'rgb(239, 68, 68)',
          outlierRadius: 3,
          itemRadius: 0,
          itemStyle: 'circle',
          itemBackgroundColor: 'black'
        }
      ]
    };
  })();
  
  // Custom box plot visualization using bar chart
  $: chartConfig = chartData ? ({
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: [
        // Min-Q1 (invisible)
        {
          label: 'Min',
          data: stats.map(s => s.percentiles.p25 - s.min),
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          stack: 'box'
        },
        // Q1-Median (lower box)
        {
          label: 'Q1-Median',
          data: stats.map(s => s.median - s.percentiles.p25),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
          stack: 'box'
        },
        // Median-Q3 (upper box)
        {
          label: 'Median-Q3',
          data: stats.map(s => s.percentiles.p75 - s.median),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
          stack: 'box'
        },
        // Q3-Max (invisible)
        {
          label: 'Max',
          data: stats.map(s => s.max - s.percentiles.p75),
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          stack: 'box'
        },
        // Mean marker
        {
          label: 'Mean',
          data: stats.map(s => s.mean),
          type: 'scatter',
          backgroundColor: 'rgb(239, 68, 68)',
          borderColor: 'rgb(239, 68, 68)',
          pointStyle: 'crossRot',
          pointRadius: 8,
          showLine: false
        }
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
          display: false
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const index = items[0].dataIndex;
              return chartData.labels[index];
            },
            beforeBody: (items) => {
              const index = items[0].dataIndex;
              const stat = stats[index];
              return [
                `Min: ${stat.min.toFixed(3)}`,
                `Q1: ${stat.percentiles.p25.toFixed(3)}`,
                `Median: ${stat.median.toFixed(3)}`,
                `Q3: ${stat.percentiles.p75.toFixed(3)}`,
                `Max: ${stat.max.toFixed(3)}`,
                `Mean: ${stat.mean.toFixed(3)}`,
                `IQR: ${(stat.percentiles.p75 - stat.percentiles.p25).toFixed(3)}`
              ];
            },
            label: () => '' // Hide default label
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Groups',
            font: {
              size: 14
            }
          }
        },
        y: {
          title: {
            display: true,
            text: 'Values',
            font: {
              size: 14
            }
          },
          beginAtZero: false
        }
      }
    }
  } as ChartConfiguration) : null;
</script>

{#if chartConfig}
  <BaseChart config={chartConfig} />
{:else}
  <div class="no-data">
    <p>No data available for box plot</p>
  </div>
{/if}

<style>
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
</style>