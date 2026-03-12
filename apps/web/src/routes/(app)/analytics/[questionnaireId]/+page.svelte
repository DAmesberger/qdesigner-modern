<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QuestionnaireAnalyticsData } from './+page';
  import type { TimeSeriesBucket } from '$lib/types/api';
  import { api } from '$lib/services/api';
  import { RealtimeAnalyticsClient } from '$lib/analytics/RealtimeAnalyticsClient.svelte';
  import { ChevronLeft } from 'lucide-svelte';

  interface Props {
    data: QuestionnaireAnalyticsData;
  }

  let { data }: Props = $props();

  let summary = $derived(data.summary);
  let timeseries = $state<TimeSeriesBucket[]>([]);
  let interval = $state<'hour' | 'day' | 'week'>('day');
  let loading = $state(false);
  let exportLoading = $state(false);

  // Real-time streaming
  let realtimeClient: RealtimeAnalyticsClient | null = null;
  let liveTotal = $state(0);
  let liveRpm = $state(0);
  let liveSessions = $state(0);

  $effect(() => {
    timeseries = [...(data.timeseries ?? [])];
  });

  // Derived stats
  let totalSessions = $derived(timeseries.reduce((s, b) => s + b.sessions_started, 0));
  let totalCompleted = $derived(timeseries.reduce((s, b) => s + b.sessions_completed, 0));
  let completionRate = $derived(totalSessions > 0 ? (totalCompleted / totalSessions * 100) : 0);
  let avgCompletionMs = $derived.by(() => {
    const withTime = timeseries.filter(b => b.avg_completion_ms !== null);
    if (withTime.length === 0) return null;
    return withTime.reduce((s, b) => s + (b.avg_completion_ms ?? 0), 0) / withTime.length;
  });

  // Time-series chart
  let chartMaxY = $derived(Math.max(...timeseries.map(b => b.sessions_started), 1));

  function chartPath(values: number[], width: number, height: number): string {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const step = width / (values.length - 1);
    return values
      .map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * (height - 10);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function formatDate(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatTime(ms: number | null): string {
    if (!ms) return '-';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining}s`;
  }

  async function changeInterval(newInterval: 'hour' | 'day' | 'week') {
    interval = newInterval;
    loading = true;
    try {
      timeseries = await api.sessions.timeseries({
        questionnaireId: data.questionnaireId,
        interval: newInterval,
      });
    } catch (err) {
      console.error('Error loading timeseries:', err);
    } finally {
      loading = false;
    }
  }

  async function exportData(format: 'json' | 'csv') {
    exportLoading = true;
    try {
      // Find the project for this questionnaire from summary
      if (!summary) return;
      const projects = await api.projects.list('');
      let projectId = '';
      for (const p of projects) {
        if (p.id === summary.project_id) {
          projectId = p.id;
          break;
        }
      }
      if (!projectId) {
        // Try fetching all projects and finding via questionnaire list
        for (const p of projects) {
          try {
            const qs = await api.questionnaires.list(p.id);
            if (qs.some(q => q.id === data.questionnaireId)) {
              projectId = p.id;
              break;
            }
          } catch { /* continue */ }
        }
      }
      if (projectId) {
        const rows = await api.questionnaires.export(projectId, data.questionnaireId, format);
        // Create and download blob
        const content = format === 'json' ? JSON.stringify(rows, null, 2) : rowsToCsv(rows);
        const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${summary?.name ?? 'export'}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      exportLoading = false;
    }
  }

  function rowsToCsv(rows: any[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','))
    ];
    return lines.join('\n');
  }

  onMount(() => {
    // Start real-time streaming
    realtimeClient = new RealtimeAnalyticsClient(data.questionnaireId);
    realtimeClient.subscribe();

    // Poll reactive state from the client
    const pollInterval = setInterval(() => {
      if (realtimeClient) {
        liveTotal = realtimeClient.metrics.totalResponses;
        liveRpm = realtimeClient.metrics.responsesPerMinute;
        liveSessions = realtimeClient.uniqueSessionCount;
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
    };
  });

  onDestroy(() => {
    realtimeClient?.destroy();
  });
</script>

<div class="min-h-screen space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
    <a
      href="/analytics"
      aria-label="Back to analytics overview"
      title="Back to analytics overview"
      class="p-2 rounded-lg hover:bg-[hsl(var(--background))]/80 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
    >
      <ChevronLeft size={20} />
    </a>
    <div class="flex-1">
      <h1 class="text-2xl font-bold text-[hsl(var(--foreground))] tracking-tight">
        {summary?.name ?? 'Questionnaire Analytics'}
      </h1>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        Detailed analytics and response data
      </p>
    </div>

    <!-- Export controls -->
    <div class="flex items-center gap-2">
      <button
        onclick={() => exportData('csv')}
        disabled={exportLoading}
        class="px-3 py-1.5 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]/80 disabled:opacity-50 transition-colors"
      >
        Export CSV
      </button>
      <button
        onclick={() => exportData('json')}
        disabled={exportLoading}
        class="px-3 py-1.5 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]/80 disabled:opacity-50 transition-colors"
      >
        Export JSON
      </button>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="glass-card p-4">
      <div class="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Total Sessions</div>
      <div class="text-2xl font-bold text-[hsl(var(--foreground))]">{totalSessions}</div>
      {#if liveTotal > 0}
        <div class="text-xs text-success mt-1">+{liveTotal} live</div>
      {/if}
    </div>

    <div class="glass-card p-4">
      <div class="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Completed</div>
      <div class="text-2xl font-bold text-[hsl(var(--foreground))]">{totalCompleted}</div>
      <div class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{completionRate.toFixed(1)}% rate</div>
    </div>

    <div class="glass-card p-4">
      <div class="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Avg Completion</div>
      <div class="text-2xl font-bold text-[hsl(var(--foreground))]">{formatTime(avgCompletionMs)}</div>
    </div>

    <div class="glass-card p-4">
      <div class="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Live Activity</div>
      <div class="text-2xl font-bold text-[hsl(var(--foreground))]">{liveRpm.toFixed(1)}</div>
      <div class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
        responses/min ({liveSessions} active)
      </div>
    </div>
  </div>

  <!-- Time-Series Chart -->
  <div class="glass-card p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-[hsl(var(--foreground))]">Response Timeline</h2>
      <div class="flex gap-1">
        {#each ['hour', 'day', 'week'] as opt}
          <button
            onclick={() => changeInterval(opt as 'hour' | 'day' | 'week')}
            class="px-3 py-1 text-xs font-medium rounded-md transition-colors
              {interval === opt
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]/50'}"
          >
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        {/each}
      </div>
    </div>

    {#if loading}
      <div class="h-48 flex items-center justify-center text-[hsl(var(--muted-foreground))]">Loading...</div>
    {:else if timeseries.length === 0}
      <div class="h-48 flex items-center justify-center text-[hsl(var(--muted-foreground))]">No data yet</div>
    {:else}
      <div class="relative h-48">
        <svg viewBox="0 0 600 180" class="w-full h-full" preserveAspectRatio="none">
          <!-- Grid lines -->
          {#each [0, 0.25, 0.5, 0.75, 1] as frac}
            <line
              x1="0" y1={180 - frac * 170}
              x2="600" y2={180 - frac * 170}
              stroke="hsl(var(--border))" stroke-width="0.5" opacity="0.5"
            />
          {/each}

          <!-- Sessions started (area + line) -->
          <path
            d={chartPath(timeseries.map(b => b.sessions_started), 600, 180) + ` L600,180 L0,180 Z`}
            fill="hsl(var(--primary))" opacity="0.1"
          />
          <path
            d={chartPath(timeseries.map(b => b.sessions_started), 600, 180)}
            fill="none" stroke="hsl(var(--primary))" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
          />

          <!-- Sessions completed (line) -->
          <path
            d={chartPath(timeseries.map(b => b.sessions_completed), 600, 180)}
            fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="4,2"
            stroke-linecap="round" stroke-linejoin="round"
          />
        </svg>

        <!-- Legend -->
        <div class="flex items-center gap-4 mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          <div class="flex items-center gap-1">
            <div class="w-3 h-0.5 bg-[hsl(var(--primary))]"></div>
            Started
          </div>
          <div class="flex items-center gap-1">
            <div class="w-3 h-0.5 bg-success border-dashed"></div>
            Completed
          </div>
          <div class="ml-auto">
            {timeseries.length} {interval === 'hour' ? 'hours' : interval === 'day' ? 'days' : 'weeks'}
            | Max: {chartMaxY}
          </div>
        </div>
      </div>

      <!-- X-axis labels -->
      {#if timeseries.length > 0}
        <div class="flex justify-between text-xs text-[hsl(var(--muted-foreground))] mt-1 px-1">
          <span>{formatDate(timeseries[0]?.timestamp ?? '')}</span>
          {#if timeseries.length > 2}
            <span>{formatDate(timeseries[Math.floor(timeseries.length / 2)]?.timestamp ?? '')}</span>
          {/if}
          <span>{formatDate(timeseries[timeseries.length - 1]?.timestamp ?? '')}</span>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Completion Funnel -->
  <div class="glass-card p-6">
    <h2 class="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">Completion Funnel</h2>
    {#if totalSessions === 0}
      <p class="text-[hsl(var(--muted-foreground))] text-sm">No session data available</p>
    {:else}
      {@const stages = [
        { label: 'Started', count: totalSessions, color: 'bg-info' },
        { label: 'Completed', count: totalCompleted, color: 'bg-success' },
        { label: 'Abandoned', count: totalSessions - totalCompleted, color: 'bg-warning' },
      ]}
      <div class="space-y-3">
        {#each stages as stage}
          {@const pct = totalSessions > 0 ? (stage.count / totalSessions * 100) : 0}
          <div class="flex items-center gap-3">
            <span class="w-24 text-sm text-[hsl(var(--muted-foreground))] text-right">{stage.label}</span>
            <div class="flex-1 h-6 bg-[hsl(var(--background))]/50 rounded-md overflow-hidden">
              <div
                class="{stage.color} h-full rounded-md transition-all duration-500"
                style="width: {pct}%"
              ></div>
            </div>
            <span class="w-20 text-sm font-medium text-[hsl(var(--foreground))] text-right">
              {stage.count} ({pct.toFixed(1)}%)
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Descriptive Stats -->
  {#if summary}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="glass-card p-6">
        <h2 class="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">Response Statistics</h2>
        <dl class="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div>
            <dt class="text-[hsl(var(--muted-foreground))]">Total Responses</dt>
            <dd class="font-medium text-[hsl(var(--foreground))]">{summary.total_responses}</dd>
          </div>
          <div>
            <dt class="text-[hsl(var(--muted-foreground))]">Completed Sessions</dt>
            <dd class="font-medium text-[hsl(var(--foreground))]">{summary.completed_sessions}</dd>
          </div>
          <div>
            <dt class="text-[hsl(var(--muted-foreground))]">Completion Rate</dt>
            <dd class="font-medium text-[hsl(var(--foreground))]">
              {summary.total_responses > 0
                ? (summary.completed_sessions / summary.total_responses * 100).toFixed(1) + '%'
                : '-'}
            </dd>
          </div>
          <div>
            <dt class="text-[hsl(var(--muted-foreground))]">Avg Completion Time</dt>
            <dd class="font-medium text-[hsl(var(--foreground))]">
              {formatTime(summary.avg_completion_time_ms)}
            </dd>
          </div>
          <div>
            <dt class="text-[hsl(var(--muted-foreground))]">Status</dt>
            <dd class="font-medium text-[hsl(var(--foreground))] capitalize">{summary.status}</dd>
          </div>
        </dl>
      </div>

      <!-- Histogram (completion time distribution) -->
      <div class="glass-card p-6">
        <h2 class="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">Time Distribution</h2>
        {#if timeseries.length === 0}
          <p class="text-[hsl(var(--muted-foreground))] text-sm">Not enough data</p>
        {:else}
          {@const completionTimes = timeseries
            .filter(b => b.avg_completion_ms !== null)
            .map(b => b.avg_completion_ms as number)}
          {#if completionTimes.length < 2}
            <p class="text-[hsl(var(--muted-foreground))] text-sm">Not enough data for histogram</p>
          {:else}
            {@const minTime = Math.min(...completionTimes)}
            {@const maxTime = Math.max(...completionTimes)}
            {@const binCount = Math.min(8, completionTimes.length)}
            {@const binWidth = (maxTime - minTime) / binCount || 1}
            {@const bins = Array.from({ length: binCount }, (_, i) => {
              const low = minTime + i * binWidth;
              const high = low + binWidth;
              return completionTimes.filter(t => i === binCount - 1 ? t >= low && t <= high : t >= low && t < high).length;
            })}
            {@const maxBin = Math.max(...bins, 1)}
            <div class="flex items-end gap-1 h-32">
              {#each bins as count, i}
                {@const height = (count / maxBin) * 100}
                <div class="flex-1 flex flex-col items-center">
                  <div
                    class="w-full bg-[hsl(var(--primary))] rounded-t-sm transition-all duration-300"
                    style="height: {height}%"
                    title="{formatTime(minTime + i * binWidth)} - {formatTime(minTime + (i + 1) * binWidth)}: {count}"
                  ></div>
                </div>
              {/each}
            </div>
            <div class="flex justify-between text-xs text-[hsl(var(--muted-foreground))] mt-1">
              <span>{formatTime(minTime)}</span>
              <span>{formatTime(maxTime)}</span>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
