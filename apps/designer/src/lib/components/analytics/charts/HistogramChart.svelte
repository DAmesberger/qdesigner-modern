<script lang="ts">
  import BaseChart from './BaseChart.svelte';
  import type { DescriptiveStats } from '$lib/analytics/types';
  import type { ChartConfiguration } from 'chart.js';
  
  export let stats: DescriptiveStats | null = null;
  export let data: number[] = [];
  export let bins: number = 10;
  export let title: string = 'Distribution Histogram';
  export let showNormalCurve: boolean = true;
  
  function calculateHistogram(values: number[], numBins: number) {
    if (values.length === 0) return { bins: [], counts: [], edges: [] };
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / numBins;
    
    const bins: number[] = [];
    const counts: number[] = new Array(numBins).fill(0);
    const edges: number[] = [];
    
    // Calculate bin edges
    for (let i = 0; i <= numBins; i++) {
      edges.push(min + i * binWidth);
    }
    
    // Calculate bin centers
    for (let i = 0; i < numBins; i++) {
      bins.push((edges[i] + edges[i + 1]) / 2);
    }
    
    // Count values in each bin
    values.forEach(value => {
      const binIndex = Math.min(
        Math.floor((value - min) / binWidth),
        numBins - 1
      );
      counts[binIndex]++;
    });
    
    return { bins, counts, edges };
  }
  
  function generateNormalCurve(mean: number, std: number, min: number, max: number, points: number = 100) {
    const x: number[] = [];
    const y: number[] = [];
    
    const step = (max - min) / points;
    for (let i = 0; i <= points; i++) {
      const xi = min + i * step;
      x.push(xi);
      
      // Normal distribution PDF
      const z = (xi - mean) / std;
      const pdf = (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
      y.push(pdf);
    }
    
    return { x, y };
  }
  
  $: chartData = (() => {
    const values = stats ? Array(stats.n).fill(0).map((_, i) => {
      // Generate sample data based on stats (for demo)
      // In real use, you'd pass actual data
      return stats.mean + (Math.random() - 0.5) * 2 * stats.std;
    }) : data;
    
    if (values.length === 0) return null;
    
    const histogram = calculateHistogram(values, bins);
    const datasets: any[] = [
      {
        label: 'Frequency',
        data: histogram.counts,
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        barPercentage: 1,
        categoryPercentage: 1
      }
    ];
    
    // Add normal curve if requested and stats available
    if (showNormalCurve && stats && stats.n > 0) {
      const normal = generateNormalCurve(
        stats.mean,
        stats.std,
        stats.min,
        stats.max
      );
      
      // Scale normal curve to match histogram
      const binWidth = (stats.max - stats.min) / bins;
      const scaleFactor = values.length * binWidth;
      
      datasets.push({
        label: 'Normal Distribution',
        data: normal.y.map(y => y * scaleFactor),
        type: 'line',
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'y'
      });
    }
    
    return {
      labels: histogram.bins.map(b => b.toFixed(2)),
      datasets
    };
  })();
  
  $: chartConfig = chartData ? ({
    type: 'bar',
    data: chartData,
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
          display: showNormalCurve,
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const item = items[0];
              const index = item.dataIndex;
              const values = stats ? Array(stats.n).fill(0).map((_, i) => {
                return stats.mean + (Math.random() - 0.5) * 2 * stats.std;
              }) : data;
              const histogram = calculateHistogram(values, bins);
              const edge1 = histogram.edges[index];
              const edge2 = histogram.edges[index + 1];
              return `Range: [${edge1.toFixed(2)}, ${edge2.toFixed(2)})`;
            },
            label: (item) => {
              return `${item.dataset.label}: ${item.formattedValue}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Value',
            font: {
              size: 14
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          title: {
            display: true,
            text: 'Frequency',
            font: {
              size: 14
            }
          },
          beginAtZero: true
        }
      }
    }
  } as ChartConfiguration) : null;
</script>

{#if chartConfig}
  <BaseChart config={chartConfig} />
{:else}
  <div class="no-data">
    <p>No data available for histogram</p>
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