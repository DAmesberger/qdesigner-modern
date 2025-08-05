<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { StatisticalEngine } from '../StatisticalEngine';
  import { RealtimeAnalytics } from '../RealtimeAnalytics';
  import { DataVisualization } from '../DataVisualization';
  import { ExportService } from '../ExportService';
  import ResponseViewer from './ResponseViewer.svelte';
  import StatisticsCard from './StatisticsCard.svelte';
  import type {
    AnalyticsData,
    DashboardConfig,
    TimeRange,
    DisplayMetric,
    FilterConfig,
    ExportFormat,
    RealtimeConfig,
    StatisticalSummary,
    PerformanceMetrics
  } from '../types';

  // Props
  interface Props {
    questionnaireId: string;
    config?: Partial<DashboardConfig>;
    realtimeConfig?: RealtimeConfig;
  }

  let { questionnaireId, config = {}, realtimeConfig }: Props = $props();

  // State management using Svelte 5 runes
  let dashboardData = $state<AnalyticsData[]>([]);
  let filteredData = $state<AnalyticsData[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedTimeRange = $state<TimeRange>({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    end: new Date(),
    preset: 'last_7_days'
  });
  let selectedMetrics = $state<DisplayMetric[]>([
    'response_count',
    'completion_rate',
    'average_response_time',
    'median_response_time'
  ]);
  let activeFilters = $state<FilterConfig[]>([]);
  let showExportDialog = $state(false);
  let showFilterPanel = $state(false);
  let realtimeEnabled = $state(false);
  let autoRefresh = $state(false);

  // Analytics instances
  let statisticalEngine: StatisticalEngine;
  let realtimeAnalytics: RealtimeAnalytics | null = null;
  let dataViz: DataVisualization;
  let exportService: ExportService;

  // Chart references
  let responseTimeChartCanvas = $state<HTMLCanvasElement>();
  let timeSeriesChartCanvas = $state<HTMLCanvasElement>();
  let performanceChartCanvas = $state<HTMLCanvasElement>();
  let correlationChartCanvas = $state<HTMLCanvasElement>();

  // Computed statistics
  let statistics = $derived(() => {
    if (filteredData.length === 0) return null;
    
    const responseTimes = filteredData.flatMap(session => 
      session.responses
        .filter(r => r.responseTime !== undefined)
        .map(r => r.responseTime!)
    );

    const reactionTimes = filteredData.flatMap(session => 
      session.responses
        .filter(r => r.reactionTime !== undefined)
        .map(r => r.reactionTime!)
    );

    return {
      responseTimeStats: responseTimes.length > 0 
        ? statisticalEngine.calculateDescriptiveStats(responseTimes)
        : null,
      reactionTimeStats: reactionTimes.length > 0 
        ? statisticalEngine.calculateDescriptiveStats(reactionTimes)
        : null,
      sessionCount: filteredData.length,
      completedSessions: filteredData.filter(s => s.endTime).length,
      completionRate: filteredData.filter(s => s.endTime).length / filteredData.length,
      totalResponses: filteredData.reduce((sum, s) => sum + s.responses.length, 0)
    };
  });

  let performanceMetrics = $derived<PerformanceMetrics | null>(() => {
    if (!statistics?.responseTimeStats) return null;
    
    return {
      responseTime: {
        mean: statistics.responseTimeStats.mean,
        median: statistics.responseTimeStats.median,
        p95: statistics.responseTimeStats.percentiles[95] || 0,
        p99: statistics.responseTimeStats.percentiles[99] || 0,
        min: statistics.responseTimeStats.min,
        max: statistics.responseTimeStats.max
      },
      renderingPerformance: {
        frameRate: 60, // Would be measured from actual performance data
        averageFrameTime: 16.67,
        droppedFrames: 0,
        renderTime: 10
      },
      memoryUsage: {
        heapUsed: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024
      },
      networkMetrics: {
        latency: 50,
        bandwidth: 1000,
        packetsLost: 0,
        reconnections: 0
      },
      userEngagement: {
        timeOnPage: 300000, // 5 minutes
        interactionCount: 25,
        scrollDepth: 80,
        focusTime: 250000 // 4 minutes 10 seconds
      }
    };
  });

  // Initialize analytics services
  onMount(async () => {
    try {
      statisticalEngine = StatisticalEngine.getInstance();
      dataViz = DataVisualization.getInstance();
      exportService = ExportService.getInstance();

      if (realtimeConfig) {
        realtimeAnalytics = RealtimeAnalytics.getInstance(realtimeConfig);
        setupRealtimeAnalytics();
      }

      await loadData();
      setupCharts();
      
      if (config.autoRefresh) {
        setupAutoRefresh();
      }

    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to initialize analytics';
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    // Clean up chart instances
    dataViz?.destroyAllCharts();
    
    // Disconnect realtime analytics
    realtimeAnalytics?.disconnect();
  });

  // Data loading and filtering
  async function loadData() {
    try {
      // In a real implementation, this would fetch from your API
      const response = await fetch(`/api/analytics/questionnaire/${questionnaireId}?` + 
        new URLSearchParams({
          start: selectedTimeRange.start.toISOString(),
          end: selectedTimeRange.end.toISOString()
        }));
      
      if (!response.ok) throw new Error('Failed to load analytics data');
      
      dashboardData = await response.json();
      applyFilters();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load data';
    }
  }

  function applyFilters() {
    filteredData = dashboardData.filter(session => {
      // Apply time range filter
      const sessionStart = new Date(session.startTime);
      if (sessionStart < selectedTimeRange.start || sessionStart > selectedTimeRange.end) {
        return false;
      }

      // Apply active filters
      return activeFilters.every(filter => {
        const value = getFilterValue(session, filter.field);
        return evaluateFilter(value, filter);
      });
    });
  }

  function getFilterValue(session: AnalyticsData, field: string): any {
    // Extract field value from session data
    const fieldParts = field.split('.');
    let value: any = session;
    
    for (const part of fieldParts) {
      value = value?.[part];
    }
    
    return value;
  }

  function evaluateFilter(value: any, filter: FilterConfig): boolean {
    switch (filter.operator) {
      case 'equals':
        return value === filter.value;
      case 'not_equals':
        return value !== filter.value;
      case 'greater_than':
        return value > filter.value;
      case 'less_than':
        return value < filter.value;
      case 'contains':
        return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'in':
        return Array.isArray(filter.value) ? filter.value.includes(value) : false;
      case 'is_null':
        return value == null;
      case 'is_not_null':
        return value != null;
      default:
        return true;
    }
  }

  // Real-time analytics setup
  function setupRealtimeAnalytics() {
    if (!realtimeAnalytics) return;

    realtimeAnalytics.on('response_submitted', (event) => {
      // Update dashboard with new response
      updateDashboardWithNewData(event.data);
    });

    realtimeAnalytics.on('session_completed', (event) => {
      // Update completion metrics
      loadData(); // Refresh data
    });

    realtimeAnalytics.on('error', (error) => {
      console.error('Realtime analytics error:', error);
    });
  }

  function updateDashboardWithNewData(newData: any) {
    // Update dashboard data with new real-time data
    // This would merge new data with existing data
    loadData(); // For simplicity, just reload data
  }

  // Chart setup and management
  function setupCharts() {
    if (!statistics) return;

    // Response time histogram
    if (responseTimeChartCanvas && statistics.responseTimeStats) {
      const responseTimes = filteredData.flatMap(session => 
        session.responses
          .filter(r => r.responseTime !== undefined)
          .map(r => r.responseTime!)
      );
      
      dataViz.createResponseTimeHistogram(responseTimeChartCanvas, responseTimes);
    }

    // Time series chart
    if (timeSeriesChartCanvas) {
      const timeSeriesData = filteredData.map(session => ({
        timestamp: new Date(session.startTime),
        value: session.responses.length,
        label: 'Responses per Session'
      }));
      
      dataViz.createTimeSeriesChart(timeSeriesChartCanvas, timeSeriesData);
    }

    // Performance metrics radar chart
    if (performanceChartCanvas && performanceMetrics) {
      dataViz.createPerformanceDashboard(performanceChartCanvas, performanceMetrics);
    }

    // Correlation analysis
    if (correlationChartCanvas && statistics.responseTimeStats && statistics.reactionTimeStats) {
      const responseTimes = filteredData.flatMap(session => 
        session.responses
          .filter(r => r.responseTime !== undefined)
          .map(r => r.responseTime!)
      );
      
      const reactionTimes = filteredData.flatMap(session => 
        session.responses
          .filter(r => r.reactionTime !== undefined)
          .map(r => r.reactionTime!)
      );

      if (responseTimes.length === reactionTimes.length && responseTimes.length > 0) {
        dataViz.createScatterPlot(correlationChartCanvas, responseTimes, reactionTimes);
      }
    }
  }

  // Auto-refresh functionality
  function setupAutoRefresh() {
    setInterval(() => {
      if (autoRefresh) {
        loadData();
      }
    }, config.refreshInterval || 30000);
  }

  // Event handlers
  function handleTimeRangeChange(newRange: TimeRange) {
    selectedTimeRange = newRange;
    loadData();
  }

  function handleFilterAdd(filter: FilterConfig) {
    activeFilters = [...activeFilters, filter];
    applyFilters();
  }

  function handleFilterRemove(index: number) {
    activeFilters = activeFilters.filter((_, i) => i !== index);
    applyFilters();
  }

  async function handleExport(format: ExportFormat) {
    try {
      const result = await exportService.exportData(filteredData, {
        format,
        includeMetadata: true,
        includeRawData: true,
        includeStatistics: true
      });

      if (result.success && result.downloadUrl) {
        // Trigger download
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.filename;
        link.click();
        
        // Clean up URL
        URL.revokeObjectURL(result.downloadUrl);
      } else {
        error = result.error || 'Export failed';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Export failed';
    }
    
    showExportDialog = false;
  }

  function toggleRealtime() {
    if (!realtimeAnalytics) return;
    
    if (realtimeEnabled) {
      realtimeAnalytics.disconnect();
    } else {
      realtimeAnalytics.connect();
    }
    
    realtimeEnabled = !realtimeEnabled;
  }

  // Refresh charts when data changes
  $effect(() => {
    if (filteredData && !loading) {
      setupCharts();
    }
  });
</script>

<!-- Dashboard Header -->
<div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
  <div class="px-6 py-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Questionnaire: {questionnaireId}
        </p>
      </div>
      
      <div class="flex items-center space-x-4">
        <!-- Real-time toggle -->
        {#if realtimeAnalytics}
          <button
            on:click={toggleRealtime}
            class="flex items-center px-3 py-2 text-sm font-medium rounded-lg {realtimeEnabled 
              ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}"
          >
            <div class="w-2 h-2 rounded-full mr-2 {realtimeEnabled ? 'bg-green-500' : 'bg-gray-400'}"></div>
            {realtimeEnabled ? 'Live' : 'Offline'}
          </button>
        {/if}

        <!-- Auto-refresh toggle -->
        <button
          on:click={() => autoRefresh = !autoRefresh}
          class="flex items-center px-3 py-2 text-sm font-medium rounded-lg {autoRefresh 
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100' 
            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}"
        >
          Auto-refresh {autoRefresh ? 'On' : 'Off'}
        </button>

        <!-- Export button -->
        <button
          on:click={() => showExportDialog = true}
          class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Export Data
        </button>

        <!-- Filter button -->
        <button
          on:click={() => showFilterPanel = !showFilterPanel}
          class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Filters ({activeFilters.length})
        </button>
      </div>
    </div>
  </div>
</div>

{#if loading}
  <!-- Loading state -->
  <div class="flex items-center justify-center py-12">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    <span class="ml-3 text-gray-600 dark:text-gray-400">Loading analytics data...</span>
  </div>
{:else if error}
  <!-- Error state -->
  <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 m-6">
    <div class="flex">
      <div class="flex-shrink-0">
        <svg class="h-5 w-5 text-red-400 dark:text-red-300" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
      </div>
      <div class="ml-3">
        <h3 class="text-sm font-medium text-red-800 dark:text-red-200">Error Loading Data</h3>
        <div class="mt-2 text-sm text-red-700 dark:text-red-300">{error}</div>
        <div class="mt-4">
          <button
            on:click={() => { error = null; loadData(); }}
            class="bg-red-100 dark:bg-red-800 px-3 py-2 rounded-md text-sm font-medium text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  </div>
{:else}
  <!-- Main dashboard content -->
  <div class="p-6">
    <!-- Statistics Cards -->
    {#if statistics}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatisticsCard
          title="Total Sessions"
          value={statistics.sessionCount}
          subtitle="{statistics.completedSessions} completed"
          trend={null}
          icon="users"
        />
        
        <StatisticsCard
          title="Completion Rate"
          value="{(statistics.completionRate * 100).toFixed(1)}%"
          subtitle="{statistics.completedSessions} / {statistics.sessionCount}"
          trend={null}
          icon="check-circle"
        />
        
        <StatisticsCard
          title="Avg Response Time"
          value="{statistics.responseTimeStats?.mean.toFixed(0) || 'N/A'}ms"
          subtitle="Median: {statistics.responseTimeStats?.median.toFixed(0) || 'N/A'}ms"
          trend={null}
          icon="clock"
        />
        
        <StatisticsCard
          title="Total Responses"
          value={statistics.totalResponses}
          subtitle="{(statistics.totalResponses / statistics.sessionCount).toFixed(1)} per session"
          trend={null}
          icon="chat-bubble-left"
        />
      </div>
    {/if}

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <!-- Response Time Histogram -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Response Time Distribution</h3>
        <div class="h-64">
          <canvas bind:this={responseTimeChartCanvas} class="w-full h-full"></canvas>
        </div>
      </div>

      <!-- Time Series Chart -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Response Timeline</h3>
        <div class="h-64">
          <canvas bind:this={timeSeriesChartCanvas} class="w-full h-full"></canvas>
        </div>
      </div>

      <!-- Performance Metrics -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance Metrics</h3>
        <div class="h-64">
          <canvas bind:this={performanceChartCanvas} class="w-full h-full"></canvas>
        </div>
      </div>

      <!-- Correlation Analysis -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Response vs Reaction Time</h3>
        <div class="h-64">
          <canvas bind:this={correlationChartCanvas} class="w-full h-full"></canvas>
        </div>
      </div>
    </div>

    <!-- Real-time Response Viewer -->
    {#if realtimeEnabled && realtimeAnalytics}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Live Response Monitor</h3>
        </div>
        <ResponseViewer {realtimeAnalytics} {questionnaireId} />
      </div>
    {/if}
  </div>
{/if}

<!-- Export Dialog -->
{#if showExportDialog}
  <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" on:click={() => showExportDialog = false}></div>
      
      <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
        <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">Export Analytics Data</h3>
          
          <div class="grid grid-cols-2 gap-3">
            {#each exportService.getSupportedFormats() as format}
              <button
                on:click={() => handleExport(format)}
                class="flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {format.toUpperCase()}
              </button>
            {/each}
          </div>
        </div>
        
        <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            on:click={() => showExportDialog = false}
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  canvas {
    max-height: 100%;
    max-width: 100%;
  }
</style>