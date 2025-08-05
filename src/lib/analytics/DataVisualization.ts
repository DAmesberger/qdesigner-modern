/**
 * Data Visualization Engine
 * Chart.js wrappers and custom visualization components for analytics
 */

import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
  TimeSeriesScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import type {
  ChartConfig,
  ChartType,
  ChartData,
  Dataset,
  ChartPoint,
  ChartOptions,
  StatisticalSummary,
  PerformanceMetrics
} from './types';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
  TimeSeriesScale
);

export class DataVisualization {
  private static instance: DataVisualization;
  private charts: Map<string, Chart> = new Map();
  private colorPalette: string[] = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  private constructor() {}

  static getInstance(): DataVisualization {
    if (!DataVisualization.instance) {
      DataVisualization.instance = new DataVisualization();
    }
    return DataVisualization.instance;
  }

  // ============================================================================
  // Chart Creation Methods
  // ============================================================================

  /**
   * Create a response time histogram
   */
  createResponseTimeHistogram(
    canvas: HTMLCanvasElement,
    responseTimes: number[],
    options?: Partial<ChartOptions>
  ): Chart {
    const bins = this.createHistogramBins(responseTimes, 20);
    const chartId = `histogram_${Date.now()}`;

    const config: ChartConfig = {
      type: 'histogram',
      data: {
        labels: bins.labels,
        datasets: [{
          label: 'Response Time Distribution',
          data: bins.counts,
          backgroundColor: this.colorPalette[0] + '80',
          borderColor: this.colorPalette[0],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Response Time (ms)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Frequency'
            },
            ticks: {
              precision: 0
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Response Time Distribution'
          },
          tooltip: {
            callbacks: {
              title: (context) => {
                const index = context[0].dataIndex;
                return `${bins.binRanges[index].min.toFixed(0)}ms - ${bins.binRanges[index].max.toFixed(0)}ms`;
              },
              label: (context) => `Frequency: ${context.parsed.y}`
            }
          }
        },
        ...options
      },
      responsive: true,
      maintainAspectRatio: false
    };

    const chart = new Chart(canvas, {
      type: 'bar',
      data: config.data,
      options: config.options
    });

    this.charts.set(chartId, chart);
    return chart;
  }

  /**
   * Create a time series chart for longitudinal data
   */
  createTimeSeriesChart(
    canvas: HTMLCanvasElement,
    timeSeriesData: { timestamp: Date; value: number; label?: string }[],
    options?: Partial<ChartOptions>
  ): Chart {
    const chartId = `timeseries_${Date.now()}`;

    const datasets: Dataset[] = this.groupTimeSeriesData(timeSeriesData);

    const config: ChartConfig = {
      type: 'time_series',
      data: {
        labels: [],
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Value'
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Time Series Analysis'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        ...options
      },
      responsive: true,
      maintainAspectRatio: false
    };

    const chart = new Chart(canvas, {
      type: 'line',
      data: config.data,
      options: config.options
    });

    this.charts.set(chartId, chart);
    return chart;
  }

  /**
   * Create a scatter plot for correlation analysis
   */
  createScatterPlot(
    canvas: HTMLCanvasElement,
    xData: number[],
    yData: number[],
    labels?: string[],
    options?: Partial<ChartOptions>
  ): Chart {
    if (xData.length !== yData.length) {
      throw new Error('X and Y data must have equal length');
    }

    const chartId = `scatter_${Date.now()}`;
    const scatterData: ChartPoint[] = xData.map((x, i) => ({
      x,
      y: yData[i],
      metadata: labels ? { label: labels[i] } : undefined
    }));

    const config: ChartConfig = {
      type: 'scatter',
      data: {
        labels: [],
        datasets: [{
          label: 'Data Points',
          data: scatterData,
          backgroundColor: this.colorPalette[0] + '80',
          borderColor: this.colorPalette[0],
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'X Variable'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Y Variable'
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Correlation Analysis'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const point = context.raw as ChartPoint;
                const label = point.metadata?.label || '';
                return `${label} (${point.x}, ${point.y})`;
              }
            }
          }
        },
        ...options
      },
      responsive: true,
      maintainAspectRatio: false
    };

    const chart = new Chart(canvas, {
      type: 'scatter',
      data: config.data,
      options: config.options
    });

    this.charts.set(chartId, chart);
    return chart;
  }

  /**
   * Create a heatmap for matrix questions or correlation matrices
   */
  createHeatmap(
    canvas: HTMLCanvasElement,
    data: number[][],
    xLabels: string[],
    yLabels: string[],
    options?: Partial<ChartOptions>
  ): Chart {
    const chartId = `heatmap_${Date.now()}`;
    
    // Flatten 2D data for Chart.js
    const flattenedData: ChartPoint[] = [];
    data.forEach((row, y) => {
      row.forEach((value, x) => {
        flattenedData.push({
          x,
          y,
          metadata: {
            value,
            xLabel: xLabels[x],
            yLabel: yLabels[y],
            intensity: this.normalizeValue(value, data.flat())
          }
        });
      });
    });

    const config: ChartConfig = {
      type: 'heatmap',
      data: {
        labels: [],
        datasets: [{
          label: 'Heatmap',
          data: flattenedData,
          backgroundColor: (context) => {
            const point = context.raw as ChartPoint;
            const intensity = point.metadata?.intensity || 0;
            return this.getHeatmapColor(intensity);
          },
          borderColor: '#ffffff',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            min: -0.5,
            max: xLabels.length - 0.5,
            ticks: {
              stepSize: 1,
              callback: (value) => xLabels[value as number] || ''
            },
            title: {
              display: true,
              text: 'X Axis'
            }
          },
          y: {
            type: 'linear',
            min: -0.5,
            max: yLabels.length - 0.5,
            ticks: {
              stepSize: 1,
              callback: (value) => yLabels[value as number] || ''
            },
            title: {
              display: true,
              text: 'Y Axis'
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Heatmap Analysis'
          },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (context) => {
                const point = context.raw as ChartPoint;
                const meta = point.metadata;
                return `${meta?.xLabel} × ${meta?.yLabel}: ${meta?.value}`;
              }
            }
          },
          legend: {
            display: false
          }
        },
        elements: {
          point: {
            radius: 0
          }
        },
        ...options
      },
      responsive: true,
      maintainAspectRatio: false
    };

    const chart = new Chart(canvas, {
      type: 'scatter',
      data: config.data,
      options: config.options
    });

    this.charts.set(chartId, chart);
    return chart;
  }

  /**
   * Create a box plot for statistical distribution analysis
   */
  createBoxPlot(
    canvas: HTMLCanvasElement,
    datasets: { label: string; data: number[] }[],
    options?: Partial<ChartOptions>
  ): Chart {
    const chartId = `boxplot_${Date.now()}`;
    
    const boxPlotData = datasets.map((dataset, index) => {
      const stats = this.calculateBoxPlotStats(dataset.data);
      return {
        label: dataset.label,
        data: [stats],
        backgroundColor: this.colorPalette[index % this.colorPalette.length] + '40',
        borderColor: this.colorPalette[index % this.colorPalette.length],
        borderWidth: 2,
        outlierColor: this.colorPalette[index % this.colorPalette.length] + '80'
      };
    });

    const config: ChartConfig = {
      type: 'box_plot',
      data: {
        labels: datasets.map(d => d.label),
        datasets: boxPlotData
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: {
              display: true,
              text: 'Value'
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Box Plot Analysis'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const stats = context.raw as any;
                return [
                  `Min: ${stats.min.toFixed(2)}`,
                  `Q1: ${stats.q1.toFixed(2)}`,
                  `Median: ${stats.median.toFixed(2)}`,
                  `Q3: ${stats.q3.toFixed(2)}`,
                  `Max: ${stats.max.toFixed(2)}`,
                  `Outliers: ${stats.outliers.length}`
                ];
              }
            }
          }
        },
        ...options
      },
      responsive: true,
      maintainAspectRatio: false
    };

    // Note: Box plots require a custom chart type or plugin
    // For now, we'll create a custom visualization using multiple chart elements
    const chart = this.createCustomBoxPlot(canvas, boxPlotData, config.options);
    
    this.charts.set(chartId, chart);
    return chart;
  }

  /**
   * Create a performance metrics dashboard
   */
  createPerformanceDashboard(
    canvas: HTMLCanvasElement,
    metrics: PerformanceMetrics,
    options?: Partial<ChartOptions>
  ): Chart {
    const chartId = `performance_${Date.now()}`;

    const config: ChartConfig = {
      type: 'radar',
      data: {
        labels: [
          'Response Time',
          'Frame Rate',
          'Memory Usage',
          'Network Latency',
          'User Engagement'
        ],
        datasets: [{
          label: 'Performance Metrics',
          data: [
            this.normalizeMetric(metrics.responseTime.mean, 0, 5000), // 0-5000ms
            this.normalizeMetric(metrics.renderingPerformance.frameRate, 0, 120), // 0-120fps
            this.normalizeMetric(metrics.memoryUsage.heapUsed, 0, 100 * 1024 * 1024), // 0-100MB
            this.normalizeMetric(metrics.networkMetrics.latency, 0, 1000), // 0-1000ms
            this.normalizeMetric(metrics.userEngagement.interactionCount, 0, 100) // 0-100 interactions
          ],
          backgroundColor: this.colorPalette[0] + '20',
          borderColor: this.colorPalette[0],
          borderWidth: 2,
          pointBackgroundColor: this.colorPalette[0],
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: this.colorPalette[0]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: {
              display: true
            },
            suggestedMin: 0,
            suggestedMax: 100
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Performance Metrics Overview'
          }
        },
        ...options
      },
      responsive: true,
      maintainAspectRatio: false
    };

    const chart = new Chart(canvas, {
      type: 'radar',
      data: config.data,
      options: config.options
    });

    this.charts.set(chartId, chart);
    return chart;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private createHistogramBins(data: number[], binCount: number = 20) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / binCount;
    
    const bins = Array(binCount).fill(0);
    const binRanges: { min: number; max: number }[] = [];
    const labels: string[] = [];
    
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binWidth;
      const binMax = min + (i + 1) * binWidth;
      binRanges.push({ min: binMin, max: binMax });
      labels.push(`${binMin.toFixed(0)}-${binMax.toFixed(0)}`);
    }
    
    data.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
      bins[binIndex]++;
    });
    
    return {
      counts: bins,
      labels,
      binRanges
    };
  }

  private groupTimeSeriesData(data: { timestamp: Date; value: number; label?: string }[]): Dataset[] {
    const groups = new Map<string, ChartPoint[]>();
    
    data.forEach(point => {
      const label = point.label || 'Series 1';
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push({
        x: point.timestamp,
        y: point.value
      });
    });
    
    return Array.from(groups.entries()).map(([label, points], index) => ({
      label,
      data: points,
      borderColor: this.colorPalette[index % this.colorPalette.length],
      backgroundColor: this.colorPalette[index % this.colorPalette.length] + '20',
      fill: false,
      tension: 0.1
    }));
  }

  private calculateBoxPlotStats(data: number[]) {
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    
    const q1 = this.calculateQuartile(sorted, 0.25);
    const median = this.calculateQuartile(sorted, 0.5);
    const q3 = this.calculateQuartile(sorted, 0.75);
    
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    const outliers = sorted.filter(x => x < lowerBound || x > upperBound);
    const whiskerMin = Math.max(sorted[0], lowerBound);
    const whiskerMax = Math.min(sorted[n - 1], upperBound);
    
    return {
      min: whiskerMin,
      q1,
      median,
      q3,
      max: whiskerMax,
      outliers
    };
  }

  private calculateQuartile(sortedData: number[], percentile: number): number {
    const index = percentile * (sortedData.length - 1);
    
    if (Number.isInteger(index)) {
      return sortedData[index];
    }
    
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
  }

  private createCustomBoxPlot(canvas: HTMLCanvasElement, data: any[], options: any): Chart {
    // This would be a custom implementation of box plots
    // For now, we'll create a bar chart that approximates box plots
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Median',
          data: data.map(d => d.data[0].median),
          backgroundColor: this.colorPalette[0] + '80',
          borderColor: this.colorPalette[0],
          borderWidth: 1
        }]
      },
      options
    });
  }

  private normalizeValue(value: number, dataset: number[]): number {
    const min = Math.min(...dataset);
    const max = Math.max(...dataset);
    return max === min ? 0.5 : (value - min) / (max - min);
  }

  private getHeatmapColor(intensity: number): string {
    // Create a heat map color scale from blue (low) to red (high)
    const blue = { r: 59, g: 130, b: 246 };  // #3B82F6
    const red = { r: 239, g: 68, b: 68 };    // #EF4444
    
    const r = Math.round(blue.r + (red.r - blue.r) * intensity);
    const g = Math.round(blue.g + (red.g - blue.g) * intensity);
    const b = Math.round(blue.b + (red.b - blue.b) * intensity);
    
    return `rgba(${r}, ${g}, ${b}, 0.8)`;
  }

  private normalizeMetric(value: number, min: number, max: number): number {
    return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  }

  // ============================================================================
  // Chart Management
  // ============================================================================

  /**
   * Update chart data
   */
  updateChart(chartId: string, newData: ChartData): void {
    const chart = this.charts.get(chartId);
    if (chart) {
      chart.data = newData;
      chart.update();
    }
  }

  /**
   * Destroy a chart and clean up resources
   */
  destroyChart(chartId: string): void {
    const chart = this.charts.get(chartId);
    if (chart) {
      chart.destroy();
      this.charts.delete(chartId);
    }
  }

  /**
   * Destroy all charts
   */
  destroyAllCharts(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
  }

  /**
   * Get chart instance by ID
   */
  getChart(chartId: string): Chart | undefined {
    return this.charts.get(chartId);
  }

  /**
   * Export chart as image
   */
  exportChart(chartId: string, format: 'png' | 'jpeg' = 'png'): string | null {
    const chart = this.charts.get(chartId);
    if (chart) {
      return chart.toBase64Image(`image/${format}`, 1.0);
    }
    return null;
  }

  /**
   * Resize chart
   */
  resizeChart(chartId: string, width?: number, height?: number): void {
    const chart = this.charts.get(chartId);
    if (chart) {
      if (width !== undefined) chart.canvas.width = width;
      if (height !== undefined) chart.canvas.height = height;
      chart.resize();
    }
  }

  /**
   * Set custom color palette
   */
  setColorPalette(colors: string[]): void {
    this.colorPalette = colors;
  }

  /**
   * Get current color palette
   */
  getColorPalette(): string[] {
    return [...this.colorPalette];
  }

  /**
   * Generate chart configuration for specific visualization type
   */
  generateChartConfig(
    type: ChartType,
    data: any,
    customOptions?: Partial<ChartOptions>
  ): ChartConfig {
    const baseConfig: ChartConfig = {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...customOptions
      },
      responsive: true,
      maintainAspectRatio: false
    };

    // Add type-specific configurations
    switch (type) {
      case 'histogram':
      case 'bar':
        baseConfig.options.scales = {
          y: {
            beginAtZero: true,
            ...customOptions?.scales?.y
          },
          ...customOptions?.scales
        };
        break;
      
      case 'time_series':
      case 'line':
        baseConfig.options.scales = {
          x: {
            type: 'time',
            ...customOptions?.scales?.x
          },
          ...customOptions?.scales
        };
        break;
      
      case 'scatter':
        baseConfig.options.scales = {
          x: {
            type: 'linear',
            position: 'bottom',
            ...customOptions?.scales?.x
          },
          ...customOptions?.scales
        };
        break;
    }

    return baseConfig;
  }

  /**
   * Get analytics insights from chart data
   */
  getChartInsights(chartId: string): any {
    const chart = this.charts.get(chartId);
    if (!chart) return null;

    const data = chart.data.datasets[0]?.data as number[];
    if (!data || data.length === 0) return null;

    return {
      dataPoints: data.length,
      mean: data.reduce((sum, val) => sum + val, 0) / data.length,
      min: Math.min(...data),
      max: Math.max(...data),
      range: Math.max(...data) - Math.min(...data)
    };
  }
}