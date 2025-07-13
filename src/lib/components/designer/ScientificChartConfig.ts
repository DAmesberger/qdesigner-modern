import type { ChartConfiguration, ChartType, ChartDataset, Plugin } from 'chart.js';

// Scientific chart types that extend standard Chart.js functionality
export type ScientificChartType = 
  | ChartType // Standard Chart.js types
  | 'distribution'
  | 'percentile'
  | 'histogram'
  | 'boxplot'
  | 'violin'
  | 'heatmap'
  | 'correlogram'
  | 'ridgeline'
  | 'forest'
  | 'funnel';

// Configuration for scientific visualizations
export interface ScientificChartConfig {
  type: ScientificChartType;
  title?: string;
  showLegend?: boolean;
  showGrid?: boolean;
  showStatistics?: boolean;
  normativeData?: any;
  confidenceInterval?: number;
  customOptions?: Partial<ChartConfiguration['options']>;
  customPlugins?: Plugin[];
}

// Helper to create scientific chart configurations
export class ScientificChartBuilder {
  static createConfiguration(
    type: ScientificChartType,
    data: any,
    options: ScientificChartConfig
  ): ChartConfiguration {
    const baseType = this.mapToChartJsType(type);
    const chartData = this.transformData(type, data);
    const chartOptions = this.buildOptions(type, options);
    const plugins = this.getPlugins(type, options);

    return {
      type: baseType,
      data: chartData,
      options: {
        ...chartOptions,
        ...options.customOptions
      },
      plugins: [...plugins, ...(options.customPlugins || [])]
    };
  }

  private static mapToChartJsType(type: ScientificChartType): ChartType {
    const mapping: Record<string, ChartType> = {
      'distribution': 'line',
      'percentile': 'line',
      'histogram': 'bar',
      'boxplot': 'bar',
      'violin': 'bar',
      'heatmap': 'scatter',
      'correlogram': 'scatter',
      'ridgeline': 'line',
      'forest': 'scatter',
      'funnel': 'bar'
    };

    return mapping[type] || (type as ChartType);
  }

  private static transformData(type: ScientificChartType, data: any): any {
    // Transform data based on chart type
    switch (type) {
      case 'distribution':
        return this.createDistributionData(data);
      case 'boxplot':
        return this.createBoxplotData(data);
      case 'histogram':
        return this.createHistogramData(data);
      default:
        return data;
    }
  }

  private static buildOptions(type: ScientificChartType, config: ScientificChartConfig): any {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: config.showLegend ?? true
        },
        title: {
          display: !!config.title,
          text: config.title
        }
      }
    };

    // Add type-specific options
    switch (type) {
      case 'scatter':
      case 'heatmap':
      case 'correlogram':
        return {
          ...baseOptions,
          scales: {
            x: { type: 'linear', grid: { display: config.showGrid } },
            y: { type: 'linear', grid: { display: config.showGrid } }
          }
        };
      
      case 'distribution':
      case 'percentile':
        return {
          ...baseOptions,
          scales: {
            x: { grid: { display: config.showGrid } },
            y: { grid: { display: config.showGrid }, beginAtZero: false }
          },
          elements: {
            line: { tension: 0.4 }
          }
        };

      default:
        return {
          ...baseOptions,
          scales: {
            x: { grid: { display: config.showGrid } },
            y: { grid: { display: config.showGrid }, beginAtZero: true }
          }
        };
    }
  }

  private static getPlugins(type: ScientificChartType, config: ScientificChartConfig): Plugin[] {
    const plugins: Plugin[] = [];

    // Add statistics overlay plugin if requested
    if (config.showStatistics) {
      plugins.push(this.createStatisticsPlugin(type));
    }

    // Add type-specific plugins
    switch (type) {
      case 'distribution':
        plugins.push(this.createNormalCurvePlugin());
        break;
      case 'boxplot':
        plugins.push(this.createBoxplotPlugin());
        break;
      case 'forest':
        plugins.push(this.createForestPlotPlugin());
        break;
    }

    return plugins;
  }

  // Data transformation methods
  private static createDistributionData(rawData: number[]): any {
    const mean = rawData.reduce((a, b) => a + b, 0) / rawData.length;
    const variance = rawData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rawData.length;
    const stdDev = Math.sqrt(variance);

    const bins = 50;
    const min = Math.min(...rawData) - 2 * stdDev;
    const max = Math.max(...rawData) + 2 * stdDev;
    const step = (max - min) / bins;

    const points = [];
    for (let i = 0; i <= bins; i++) {
      const x = min + i * step;
      const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * 
                Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2));
      points.push({ x, y });
    }

    return {
      datasets: [{
        label: 'Distribution',
        data: points,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };
  }

  private static createBoxplotData(data: Record<string, number[]>): any {
    const labels = Object.keys(data);
    const boxplotData = labels.map(label => {
      const values = data[label];
      if (!values || values.length === 0) {
        return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
      }
      
      const sortedValues = [...values].sort((a, b) => a - b);
      const q1 = this.percentile(sortedValues, 25);
      const median = this.percentile(sortedValues, 50);
      const q3 = this.percentile(sortedValues, 75);
      const min = sortedValues[0];
      const max = sortedValues[sortedValues.length - 1];
      
      return { min, q1, median, q3, max };
    });

    return {
      labels,
      datasets: [{
        label: 'Box Plot',
        data: boxplotData,
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1
      }]
    };
  }

  private static createHistogramData(values: number[], binCount: number = 20): any {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / binCount;
    
    const bins = Array(binCount).fill(0);
    const binLabels = [];

    for (let i = 0; i < binCount; i++) {
      const binStart = min + i * binWidth;
      const binEnd = binStart + binWidth;
      binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
      
      values.forEach(value => {
        if (value >= binStart && value < binEnd) {
          bins[i]++;
        }
      });
    }

    return {
      labels: binLabels,
      datasets: [{
        label: 'Frequency',
        data: bins,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1
      }]
    };
  }

  // Plugin creators
  private static createStatisticsPlugin(type: ScientificChartType): Plugin {
    return {
      id: 'statistics-overlay',
      afterDraw: (chart) => {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        
        // Draw statistics based on chart type
        ctx.save();
        ctx.font = '12px Arial';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.textAlign = 'right';
        
        // Add mean line, confidence intervals, etc.
        ctx.restore();
      }
    };
  }

  private static createNormalCurvePlugin(): Plugin {
    return {
      id: 'normal-curve',
      afterDatasetsDraw: (chart) => {
        // Overlay normal distribution curve
      }
    };
  }

  private static createBoxplotPlugin(): Plugin {
    return {
      id: 'boxplot-renderer',
      afterDatasetsDraw: (chart) => {
        // Custom boxplot rendering with whiskers
      }
    };
  }

  private static createForestPlotPlugin(): Plugin {
    return {
      id: 'forest-plot',
      afterDatasetsDraw: (chart) => {
        // Render forest plot with confidence intervals
      }
    };
  }

  // Utility methods
  private static percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    
    const index = (p / 100) * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (lower === upper) {
      return arr[lower] ?? 0;
    }
    
    return (arr[lower] ?? 0) * (1 - weight) + (arr[upper] ?? 0) * weight;
  }
}

// Export preset configurations for common scientific charts
export const SCIENTIFIC_CHART_PRESETS = {
  normalDistribution: {
    type: 'distribution' as ScientificChartType,
    showStatistics: true,
    showGrid: true,
    customOptions: {
      scales: {
        y: {
          title: {
            display: true,
            text: 'Probability Density'
          }
        }
      }
    }
  },
  
  comparisonBoxplot: {
    type: 'boxplot' as ScientificChartType,
    showStatistics: true,
    showGrid: true,
    customOptions: {
      scales: {
        y: {
          title: {
            display: true,
            text: 'Values'
          }
        }
      }
    }
  },
  
  correlationMatrix: {
    type: 'heatmap' as ScientificChartType,
    showLegend: false,
    showGrid: false,
    customOptions: {
      scales: {
        x: { display: true },
        y: { display: true }
      }
    }
  }
};