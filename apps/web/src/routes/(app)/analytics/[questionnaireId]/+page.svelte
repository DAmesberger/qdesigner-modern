<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QuestionnaireAnalyticsData } from './+page';
  import type { TimeSeriesBucket } from '$lib/shared/types/api';
  import { api } from '$lib/services/api';
  import { RealtimeAnalyticsClient } from '$lib/analytics/RealtimeAnalyticsClient.svelte';
  import { rowsToCsv } from '$lib/analytics/ResponseExportService';
  import { ChevronLeft } from 'lucide-svelte';
  import { buildPsychometrics } from '$lib/analytics/psychometrics';
  import StatisticsCard from '$lib/analytics/components/StatisticsCard.svelte';
  import DescriptiveStatsWidget from '$lib/analytics/components/DescriptiveStatsWidget.svelte';
  import AdvancedAnalytics from '$lib/analytics/components/AdvancedAnalytics.svelte';
  import ReliabilityPanel from '$lib/components/analytics/ReliabilityPanel.svelte';
  import IRTPanel from '$lib/components/analytics/IRTPanel.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';

  interface Props {
    data: QuestionnaireAnalyticsData;
  }

  let { data }: Props = $props();

  let view = $state<'overview' | 'advanced'>('overview');

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

  // Psychometrics (reliability / item stats / IRT) derived from raw response rows
  let psychometrics = $derived(buildPsychometrics(data.exportRows ?? []));

  function alphaColorName(alpha: number): 'green' | 'blue' | 'yellow' | 'red' {
    if (alpha >= 0.9) return 'green';
    if (alpha >= 0.8) return 'blue';
    if (alpha >= 0.7) return 'yellow';
    return 'red';
  }

  function alphaLabel(alpha: number): string {
    if (alpha >= 0.9) return 'Excellent';
    if (alpha >= 0.8) return 'Good';
    if (alpha >= 0.7) return 'Acceptable';
    if (alpha >= 0.6) return 'Questionable';
    if (alpha >= 0.5) return 'Poor';
    return 'Unacceptable';
  }

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
      // The owning project id comes straight off the summary — no need to
      // list every project (and walk each one's questionnaires) to find it.
      const projectId = summary?.project_id;
      if (!projectId) return;

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
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      exportLoading = false;
    }
  }

  // E-FLOW-6: live per-arm allocation counts from the authoritative
  // arm_counts ledger (server-atomic between-subjects assignment).
  let armCounts = $state<Record<string, number>>({});
  let armEntries = $derived(
    Object.entries(armCounts).sort(([a], [b]) => a.localeCompare(b))
  );
  let armTotal = $derived(armEntries.reduce((s, [, n]) => s + n, 0));

  async function loadArmCounts() {
    try {
      armCounts = await api.questionnaires.armCounts(data.questionnaireId);
    } catch {
      // Non-critical: no between-subjects design or no assignments yet.
      armCounts = {};
    }
  }

  onMount(() => {
    // Start real-time streaming
    realtimeClient = new RealtimeAnalyticsClient(data.questionnaireId);
    realtimeClient.subscribe();

    void loadArmCounts();

    // Poll reactive state from the client
    const pollInterval = setInterval(() => {
      if (realtimeClient) {
        liveTotal = realtimeClient.metrics.totalResponses;
        liveRpm = realtimeClient.metrics.responsesPerMinute;
        liveSessions = realtimeClient.uniqueSessionCount;
      }
    }, 2000);

    // Refresh arm balance periodically so the designer sees allocation drift live.
    const armInterval = setInterval(() => void loadArmCounts(), 5000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(armInterval);
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
      class="p-2 rounded-lg hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft size={20} />
    </a>
    <div class="flex-1">
      <h1 class="text-2xl font-bold text-foreground tracking-tight">
        {summary?.name ?? 'Questionnaire Analytics'}
      </h1>
      <p class="text-sm text-muted-foreground">
        Detailed analytics and response data
      </p>
    </div>

    <!-- Export controls -->
    <div class="flex items-center gap-2">
      <button
        onclick={() => exportData('csv')}
        disabled={exportLoading}
        class="px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-background/80 disabled:opacity-50 transition-colors"
      >
        Export CSV
      </button>
      <button
        onclick={() => exportData('json')}
        disabled={exportLoading}
        class="px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-background/80 disabled:opacity-50 transition-colors"
      >
        Export JSON
      </button>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex items-center gap-1 border-b border-border">
    {#each [{ id: 'overview', label: 'Overview' }, { id: 'advanced', label: 'Advanced' }] as tab}
      <button
        onclick={() => (view = tab.id as 'overview' | 'advanced')}
        class="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors
          {view === tab.id
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if view === 'overview'}
  <!-- Summary Cards -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="glass-card p-4">
      <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Sessions</div>
      <div class="text-2xl font-bold text-foreground">{totalSessions}</div>
      {#if liveTotal > 0}
        <div class="text-xs text-success mt-1">+{liveTotal} live</div>
      {/if}
    </div>

    <div class="glass-card p-4">
      <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Completed</div>
      <div class="text-2xl font-bold text-foreground">{totalCompleted}</div>
      <div class="text-xs text-muted-foreground mt-1">{completionRate.toFixed(1)}% rate</div>
    </div>

    <div class="glass-card p-4">
      <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Avg Completion</div>
      <div class="text-2xl font-bold text-foreground">{formatTime(avgCompletionMs)}</div>
    </div>

    <div class="glass-card p-4">
      <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Live Activity</div>
      <div class="text-2xl font-bold text-foreground">{liveRpm.toFixed(1)}</div>
      <div class="text-xs text-muted-foreground mt-1">
        responses/min ({liveSessions} active)
      </div>
    </div>
  </div>

  <!-- Time-Series Chart -->
  <div class="glass-card p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-foreground">Response Timeline</h2>
      <div class="flex gap-1">
        {#each ['hour', 'day', 'week'] as opt}
          <button
            onclick={() => changeInterval(opt as 'hour' | 'day' | 'week')}
            class="px-3 py-1 text-xs font-medium rounded-md transition-colors
              {interval === opt
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
          >
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        {/each}
      </div>
    </div>

    {#if loading}
      <!-- Chart-shaped skeleton during the async timeseries refetch (interval change). -->
      <div class="space-y-2">
        <Skeleton variant="rounded" width="100%" height="12rem" />
        <div class="flex items-center gap-4">
          <Skeleton variant="text" width="4rem" />
          <Skeleton variant="text" width="4rem" />
          <Skeleton variant="text" width="6rem" className="ml-auto" />
        </div>
      </div>
    {:else if timeseries.length === 0}
      <div class="h-48 flex items-center justify-center text-muted-foreground">No data yet</div>
    {:else}
      <div class="flex flex-col">
        <svg viewBox="0 0 600 180" class="w-full h-48 block" preserveAspectRatio="none">
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
            fill="none" stroke="hsl(var(--success))" stroke-width="2" stroke-dasharray="4,2"
            stroke-linecap="round" stroke-linejoin="round"
          />
        </svg>

        <!-- Legend -->
        <div class="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <div class="flex items-center gap-1">
            <div class="w-3 h-0.5 bg-primary"></div>
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
        <div class="flex justify-between text-xs text-muted-foreground mt-1 px-1">
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
    <h2 class="text-lg font-semibold text-foreground mb-4">Completion Funnel</h2>
    {#if totalSessions === 0}
      <p class="text-muted-foreground text-sm">No session data available</p>
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
            <span class="w-24 text-sm text-muted-foreground text-right">{stage.label}</span>
            <div class="flex-1 h-6 bg-background/50 rounded-md overflow-hidden">
              <div
                class="{stage.color} h-full rounded-md transition-all duration-500"
                style="width: {pct}%"
              ></div>
            </div>
            <span class="w-20 text-sm font-medium text-foreground text-right">
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
        <h2 class="text-lg font-semibold text-foreground mb-4">Response Statistics</h2>
        <dl class="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div>
            <dt class="text-muted-foreground">Total Responses</dt>
            <dd class="font-medium text-foreground">{summary.total_responses}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Completed Sessions</dt>
            <dd class="font-medium text-foreground">{summary.completed_sessions}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Completion Rate</dt>
            <dd class="font-medium text-foreground">
              {summary.total_responses > 0
                ? (summary.completed_sessions / summary.total_responses * 100).toFixed(1) + '%'
                : '-'}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Avg Completion Time</dt>
            <dd class="font-medium text-foreground">
              {formatTime(summary.avg_completion_time_ms)}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Status</dt>
            <dd class="font-medium text-foreground capitalize">{summary.status}</dd>
          </div>
        </dl>
      </div>

      <!-- Histogram (completion time distribution) -->
      <div class="glass-card p-6">
        <h2 class="text-lg font-semibold text-foreground mb-4">Time Distribution</h2>
        {#if timeseries.length === 0}
          <p class="text-muted-foreground text-sm">Not enough data</p>
        {:else}
          {@const completionTimes = timeseries
            .filter(b => b.avg_completion_ms !== null)
            .map(b => b.avg_completion_ms as number)}
          {#if completionTimes.length < 2}
            <p class="text-muted-foreground text-sm">Not enough data for histogram</p>
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
                    class="w-full bg-primary rounded-t-sm transition-all duration-300"
                    style="height: {height}%"
                    title="{formatTime(minTime + i * binWidth)} - {formatTime(minTime + (i + 1) * binWidth)}: {count}"
                  ></div>
                </div>
              {/each}
            </div>
            <div class="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{formatTime(minTime)}</span>
              <span>{formatTime(maxTime)}</span>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Between-subjects arm balance (E-FLOW-6) -->
  {#if armEntries.length > 0}
    <div class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-foreground">Arm balance</h2>
        <p class="text-sm text-muted-foreground">
          Live between-subjects allocation from the server-atomic assignment ledger.
          {armTotal} participant{armTotal === 1 ? '' : 's'} assigned across {armEntries.length} arm{armEntries.length === 1 ? '' : 's'}.
        </p>
      </div>
      <div class="glass-card p-6 space-y-3">
        {#each armEntries as [name, count] (name)}
          {@const pct = armTotal > 0 ? (count / armTotal) * 100 : 0}
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-foreground">{name}</span>
              <span class="text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
            </div>
            <div class="h-2 w-full rounded-full bg-muted">
              <div
                class="h-2 rounded-full bg-primary transition-all duration-300"
                style="width: {pct}%"
              ></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Psychometrics -->
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-foreground">Psychometrics</h2>
      <p class="text-sm text-muted-foreground">
        Reliability, item statistics and item-response modelling for numeric and scale responses.
      </p>
    </div>

    {#if psychometrics.descriptives.length === 0}
      <div class="glass-card p-6 text-sm text-muted-foreground">
        {psychometrics.reason ??
          'No numeric or scale-type responses are available for psychometric analysis yet.'}
      </div>
    {:else}
      <!-- KPI summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatisticsCard
          title="Participants"
          value={psychometrics.nParticipants}
          subtitle="complete cases"
          icon="users"
          color="blue"
        />
        <StatisticsCard
          title="Scale Items"
          value={psychometrics.nScaleItems}
          subtitle="numeric questions"
          icon="chart-bar"
          color="indigo"
        />
        {#if psychometrics.reliability}
          <StatisticsCard
            title="Cronbach's α"
            value={psychometrics.reliability.cronbachAlpha.toFixed(3)}
            subtitle={alphaLabel(psychometrics.reliability.cronbachAlpha)}
            icon="check-circle"
            color={alphaColorName(psychometrics.reliability.cronbachAlpha)}
          />
          <StatisticsCard
            title="Mean inter-item r"
            value={psychometrics.reliability.meanInterItemCorrelation.toFixed(3)}
            subtitle="average correlation"
            icon="chart-bar"
            color="gray"
          />
        {/if}
      </div>

      <!-- Reliability panel -->
      {#if psychometrics.sufficient}
        <ReliabilityPanel
          items={psychometrics.participantMatrix}
          itemNames={psychometrics.itemNames}
        />
      {:else}
        <div class="glass-card p-6 text-sm text-muted-foreground">
          {psychometrics.reason ??
            'Not enough complete data to compute a reliability coefficient.'}
        </div>
      {/if}

      <!-- Per-item descriptive statistics -->
      <div class="glass-card p-6">
        <h3 class="text-base font-semibold text-foreground mb-4">
          Item Descriptive Statistics
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each psychometrics.descriptives as item (item.questionId)}
            <DescriptiveStatsWidget stats={item.stats} label={item.label} />
          {/each}
        </div>
      </div>

      <!-- IRT (gated on dichotomous response data) -->
      {#if psychometrics.irtItems && psychometrics.irtItems.length > 0}
        <IRTPanel items={psychometrics.irtItems} />
      {:else}
        <div class="glass-card p-6 text-sm text-muted-foreground">
          Item-response (IRT) analysis requires dichotomous (0/1) item responses. The current data
          is not dichotomous, so item-characteristic curves are unavailable.
        </div>
      {/if}
    {/if}
  </div>
  {/if}

  {#if view === 'advanced'}
    <AdvancedAnalytics rows={data.exportRows ?? []} />
  {/if}
</div>
