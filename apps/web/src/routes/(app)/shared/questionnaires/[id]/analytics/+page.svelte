<script lang="ts">
  import type { SharedAnalyticsData } from './+page';
  import type { TimeSeriesBucket } from '$lib/shared/types/api';
  import { api } from '$lib/services/api';
  import { deriveGuestSummary } from '$lib/analytics/guestAnalytics';
  import { ChevronLeft, ShieldOff } from 'lucide-svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';

  interface Props {
    data: SharedAnalyticsData;
  }

  let { data }: Props = $props();

  let timeseries = $state<TimeSeriesBucket[]>([]);
  let interval = $state<'hour' | 'day' | 'week'>('day');
  let loading = $state(false);
  // Flips to true if a live refetch 403s because the grant was revoked mid-view.
  let revoked = $state(false);

  $effect(() => {
    timeseries = [...(data.timeseries ?? [])];
  });

  let summary = $derived(deriveGuestSummary(timeseries));
  let armEntries = $derived(
    Object.entries(data.armCounts ?? {}).sort(([a], [b]) => a.localeCompare(b))
  );
  let armTotal = $derived(armEntries.reduce((s, [, n]) => s + n, 0));
  let chartMaxY = $derived(Math.max(...timeseries.map((b) => b.sessions_started), 1));

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

  async function changeInterval(newInterval: 'hour' | 'day' | 'week') {
    interval = newInterval;
    loading = true;
    try {
      timeseries = await api.sessions.timeseries({
        questionnaireId: data.questionnaireId,
        interval: newInterval,
      });
    } catch {
      // A 403 here means the share was revoked while the page was open.
      revoked = true;
    } finally {
      loading = false;
    }
  }
</script>

{#if !data.available || revoked}
  <!-- Revoked / expired / never-granted: friendly dead-end, not a raw error. -->
  <div class="min-h-[60vh] flex items-center justify-center">
    <div class="glass-card max-w-md p-8 text-center space-y-4">
      <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <ShieldOff size={26} />
      </div>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-foreground">This share is no longer available</h1>
        <p class="text-sm text-muted-foreground">
          The access you had to this questionnaire's analytics has been revoked or has expired.
          Ask the owner to share it with you again.
        </p>
      </div>
      <a
        href="/dashboard"
        class="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background/80"
      >
        <ChevronLeft size={16} />
        Back to dashboard
      </a>
    </div>
  </div>
{:else}
  <div class="min-h-screen space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <a
        href="/dashboard"
        aria-label="Back to dashboard"
        title="Back to dashboard"
        class="p-2 rounded-lg hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={20} />
      </a>
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-foreground tracking-tight">
          {data.share?.resource_name ?? 'Shared Questionnaire'}
        </h1>
        <p class="text-sm text-muted-foreground">
          Read-only analytics shared with you
          {#if data.share?.shared_by_email}· from {data.share.shared_by_email}{/if}
        </p>
      </div>
      <span
        class="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {data.share?.role ?? 'viewer'}
      </span>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="glass-card p-4">
        <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Sessions</div>
        <div class="text-2xl font-bold text-foreground">{summary.totalSessions}</div>
      </div>
      <div class="glass-card p-4">
        <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Completed</div>
        <div class="text-2xl font-bold text-foreground">{summary.totalCompleted}</div>
        <div class="text-xs text-muted-foreground mt-1">{summary.completionRate.toFixed(1)}% rate</div>
      </div>
      <div class="glass-card p-4">
        <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Avg Completion</div>
        <div class="text-2xl font-bold text-foreground">{formatTime(summary.avgCompletionMs)}</div>
      </div>
      <div class="glass-card p-4">
        <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Completion Rate</div>
        <div class="text-2xl font-bold text-foreground">{summary.completionRate.toFixed(0)}%</div>
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
            {#each [0, 0.25, 0.5, 0.75, 1] as frac}
              <line
                x1="0" y1={180 - frac * 170}
                x2="600" y2={180 - frac * 170}
                stroke="hsl(var(--border))" stroke-width="0.5" opacity="0.5"
              />
            {/each}
            <path
              d={chartPath(timeseries.map((b) => b.sessions_started), 600, 180) + ` L600,180 L0,180 Z`}
              fill="hsl(var(--primary))" opacity="0.1"
            />
            <path
              d={chartPath(timeseries.map((b) => b.sessions_started), 600, 180)}
              fill="none" stroke="hsl(var(--primary))" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"
            />
            <path
              d={chartPath(timeseries.map((b) => b.sessions_completed), 600, 180)}
              fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="4,2"
              stroke-linecap="round" stroke-linejoin="round"
            />
          </svg>

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
      {#if summary.totalSessions === 0}
        <p class="text-muted-foreground text-sm">No session data available</p>
      {:else}
        {@const stages = [
          { label: 'Started', count: summary.totalSessions, color: 'bg-info' },
          { label: 'Completed', count: summary.totalCompleted, color: 'bg-success' },
          { label: 'Abandoned', count: summary.totalSessions - summary.totalCompleted, color: 'bg-warning' },
        ]}
        <div class="space-y-3">
          {#each stages as stage}
            {@const pct = summary.totalSessions > 0 ? (stage.count / summary.totalSessions) * 100 : 0}
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

    <!-- Between-subjects arm balance (guest-safe: verify_questionnaire_access) -->
    {#if armEntries.length > 0}
      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold text-foreground">Arm balance</h2>
          <p class="text-sm text-muted-foreground">
            Between-subjects allocation.
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
  </div>
{/if}
