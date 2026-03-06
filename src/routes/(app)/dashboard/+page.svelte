<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { formatDistanceToNow } from '$lib/shared/utils/date';
  import type {
    DashboardQuestionnaire,
    DashboardActivity,
    QuestionnaireStats,
    QuestionnaireListItem,
  } from '$lib/types/dashboard';
  import type { TimeSeriesBucket } from '$lib/types/api';
  import { appPaths } from '$lib/routing/paths';
  import { t } from '$lib/i18n/hooks';
  import { ws, type WsEvent } from '$lib/services/ws';
  import { api } from '$lib/services/api';
  import TourOverlay from '$lib/help/components/TourOverlay.svelte';
  import { tourEngine } from '$lib/help/tours/TourEngine.svelte';
  import { helpStore } from '$lib/help/stores/helpStore.svelte';
  import { FileText, Users, Zap, PieChart, Plus, Clock, TrendingUp, Check } from 'lucide-svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let user = $derived(data.user);
  let questionnaires = $state<DashboardQuestionnaire[]>([]);
  let recentActivity = $derived(data.recentActivity);
  let stats = $state({ totalQuestionnaires: 0, totalResponses: 0, activeQuestionnaires: 0, avgCompletionRate: 0 });

  // Time-series sparkline data per questionnaire
  let sparklineData = $state<Record<string, number[]>>({});

  // Initialize from data
  $effect(() => {
    questionnaires = [...data.questionnaires];
    stats = { ...data.stats };
  });

  // Build SVG sparkline path from data points
  function sparklinePath(values: number[], width: number, height: number): string {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const step = width / (values.length - 1);
    return values
      .map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * height;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  // Fetch time-series data for all questionnaires
  async function loadSparklines() {
    const results: Record<string, number[]> = {};
    for (const q of questionnaires) {
      try {
        const buckets = await api.sessions.timeseries({
          questionnaireId: q.questionnaire_id,
          interval: 'day',
        });
        // Take last 7 buckets for sparkline
        const last7 = buckets.slice(-7);
        results[q.questionnaire_id] = last7.map((b) => b.sessions_started);
      } catch {
        results[q.questionnaire_id] = [];
      }
    }
    sparklineData = results;
  }

  // Realtime WebSocket subscriptions
  let wsUnsubscribes: (() => void)[] = [];

  function subscribeRealtime() {
    // Subscribe to all questionnaire channels for live updates
    for (const q of questionnaires) {
      const channel = `questionnaire:${q.questionnaire_id}`;
      const unsub = ws.subscribe(channel, (msg: WsEvent) => {
        if (msg.event === 'response.submitted') {
          const payload = msg.payload as { questionnaire_id?: string; count?: number };
          const count = payload.count ?? 1;
          questionnaires = questionnaires.map((item) =>
            item.questionnaire_id === payload.questionnaire_id
              ? { ...item, total_responses: item.total_responses + count }
              : item
          );
          stats = { ...stats, totalResponses: stats.totalResponses + count };
        }
        if (msg.event === 'session.created') {
          // Increment latest sparkline bucket for this questionnaire
          const payload = msg.payload as { questionnaire_id?: string };
          const qid = payload.questionnaire_id;
          if (qid && sparklineData[qid]) {
            const prev = sparklineData[qid] as number[];
            const arr = [...prev];
            const last = arr.length - 1;
            if (last >= 0) {
              arr[last] = (arr[last] ?? 0) + 1;
            } else {
              arr.push(1);
            }
            sparklineData = { ...sparklineData, [qid]: arr };
          }
        }
        if (msg.event === 'session.completed') {
          const payload = msg.payload as { questionnaire_id?: string };
          questionnaires = questionnaires.map((item) =>
            item.questionnaire_id === payload.questionnaire_id
              ? { ...item, completed_responses: (item.completed_responses ?? 0) + 1 }
              : item
          );
        }
      });
      wsUnsubscribes.push(unsub);
    }
  }

  async function maybeStartWelcomeTour() {
    if (helpStore.hasTourCompleted('dashboard-welcome')) return;
    try {
      const mod = await import('$lib/help/tours/definitions/dashboardWelcome');
      const tour = mod.dashboardWelcomeTour;
      if (tour) tourEngine.start(tour);
    } catch { /* tour definition not available yet */ }
  }

  onMount(() => {
    // Defer subscription until questionnaires are loaded
    if (questionnaires.length > 0) {
      subscribeRealtime();
      loadSparklines();
    }
    // Auto-trigger welcome tour on first visit
    setTimeout(maybeStartWelcomeTour, 600);
  });

  onDestroy(() => {
    for (const unsub of wsUnsubscribes) unsub();
    wsUnsubscribes = [];
  });

  function getStatusColor(status: string) {
    switch (status) {
      case 'published':
        return 'bg-success/10 text-success border-success/20';
      case 'draft':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'archived':
        return 'bg-muted text-muted-foreground border-border';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  }

  function getActivityStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'text-success';
      case 'in_progress':
        return 'text-info';
      case 'abandoned':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  }

  function formatTime(ms: number | null) {
    if (!ms) return '-';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  function navigateToQuestionnaire(projectId: string, questionnaireId: string) {
    if (!projectId) {
      console.warn('Missing projectId for questionnaire:', questionnaireId);
      goto(appPaths.projects());
      return;
    }
    const url = appPaths.projectDesigner(projectId, questionnaireId);
    console.log('Navigating to:', url, 'with questionnaireId:', questionnaireId);

    // Use window.location for now to bypass the goto issue
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  function createNewQuestionnaire() {
    // Navigate to projects page to select/create project first
    if (typeof window !== 'undefined') {
      window.location.href = appPaths.projects();
    }
  }

  const welcomeMessages = [
    'Ready to design something amazing?',
    "Let's gather some insights today.",
    'Your research, visualized perfectly.',
  ];
  const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
</script>

<div class="min-h-screen">
  <!-- Header Section -->
  <div class="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
    <h1 class="text-4xl font-bold text-[hsl(var(--foreground))] tracking-tight">
      Welcome back, <span
        class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600"
        >{user?.fullName || user?.email?.split('@')[0] || 'User'}</span
      >
    </h1>
    <p class="mt-2 text-lg text-[hsl(var(--muted-foreground))]">
      {randomMessage}
    </p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
    <!-- Stats Cards (Bento Grid) -->
    <div
      class="glass-card p-6 flex items-center justify-between border-l-4 border-l-indigo-500 animate-in zoom-in duration-300 delay-0"
    >
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">{$t('analytics.overview.totalResponses', { defaultValue: 'Total Questionnaires' })}</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">
          {stats.totalQuestionnaires}
        </p>
      </div>
      <div class="p-3 bg-primary/10 rounded-full text-primary">
        <FileText size={32} />
      </div>
    </div>

    <div
      class="glass-card p-6 flex items-center justify-between border-l-4 border-l-purple-500 animate-in zoom-in duration-300 delay-100"
    >
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">{$t('analytics.overview.totalResponses')}</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">{stats.totalResponses}</p>
      </div>
      <div class="p-3 bg-purple-500/10 rounded-full text-purple-600">
        <Users size={32} />
      </div>
    </div>

    <div
      class="glass-card p-6 flex items-center justify-between border-l-4 border-l-emerald-500 animate-in zoom-in duration-300 delay-200"
    >
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">{$t('common.status.active')}</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">
          {stats.activeQuestionnaires}
        </p>
      </div>
      <div class="p-3 bg-emerald-500/10 rounded-full text-emerald-600">
        <Zap size={32} />
      </div>
    </div>

    <div
      class="glass-card p-6 flex items-center justify-between border-l-4 border-l-amber-500 animate-in zoom-in duration-300 delay-300"
    >
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">{$t('analytics.overview.completionRate')}</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">
          {stats.avgCompletionRate}%
        </p>
      </div>
      <div class="p-3 bg-amber-500/10 rounded-full text-amber-600">
        <PieChart size={32} />
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Main Content: Questionnaires -->
    <div class="lg:col-span-2 space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold text-[hsl(var(--foreground))]">Your Questionnaires</h2>
        <button
          onclick={createNewQuestionnaire}
          class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all transform hover:scale-105"
        >
          <Plus size={20} class="-ml-1 mr-2" />
          New Questionnaire
        </button>
      </div>

      {#if questionnaires.length === 0}
        <div class="glass-card p-12 text-center">
          <div
            class="mx-auto h-16 w-16 text-muted-foreground bg-muted rounded-full flex items-center justify-center mb-4"
          >
            <FileText size={32} />
          </div>
          <h3 class="mt-2 text-lg font-medium text-foreground">No questionnaires yet</h3>
          <p class="mt-1 text-muted-foreground">
            Get started by creating a new questionnaire to gather insights.
          </p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each questionnaires as questionnaire}
            <button
              type="button"
              class="glass-card p-6 w-full text-left group hover:bg-[hsl(var(--layer-surface))]/50 border-l-4 border-l-transparent hover:border-l-indigo-500"
              onclick={() =>
                navigateToQuestionnaire(
                  questionnaire.project_id || questionnaire.projectId || '',
                  questionnaire.questionnaire_id
                )}
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <h3
                    class="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-primary transition-colors"
                  >
                    {questionnaire.name}
                  </h3>
                  {#if questionnaire.description}
                    <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))] line-clamp-2">
                      {questionnaire.description}
                    </p>
                  {/if}
                </div>
                <span
                  class={`ml-4 px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(questionnaire.status)}`}
                >
                  {questionnaire.status}
                </span>
              </div>

              <div class="mt-6 grid grid-cols-3 gap-4">
                <div class="text-center p-3 bg-[hsl(var(--background))]/50 rounded-lg">
                  <p class="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                    Responses
                  </p>
                  <p class="font-bold text-lg text-[hsl(var(--foreground))] mt-1">
                    {questionnaire.total_responses || 0}
                  </p>
                </div>
                <div class="text-center p-3 bg-[hsl(var(--background))]/50 rounded-lg">
                  <p class="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                    Completed
                  </p>
                  <p class="font-bold text-lg text-[hsl(var(--foreground))] mt-1">
                    {questionnaire.completed_responses || 0}
                  </p>
                </div>
                <div class="text-center p-3 bg-[hsl(var(--background))]/50 rounded-lg">
                  <p class="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                    Time
                  </p>
                  <p class="font-bold text-lg text-[hsl(var(--foreground))] mt-1">
                    {formatTime(questionnaire.avg_completion_time ?? 0)}
                  </p>
                </div>
              </div>

              <!-- Sparkline: sessions over the last 7 days -->
              {#if sparklineData[questionnaire.questionnaire_id]?.length}
                {@const values = sparklineData[questionnaire.questionnaire_id] ?? []}
                <div class="mt-4 flex items-center gap-3">
                  <span class="text-xs text-[hsl(var(--muted-foreground))] shrink-0">7d trend</span>
                  <svg viewBox="0 0 120 28" class="w-full h-7" preserveAspectRatio="none">
                    <path
                      d={sparklinePath(values, 120, 28)}
                      fill="none"
                      stroke="url(#sparkGrad)"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <defs>
                      <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#6366f1" />
                        <stop offset="100%" stop-color="#a855f7" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span class="text-xs font-medium text-[hsl(var(--foreground))] shrink-0">
                    {values.reduce((a: number, b: number) => a + b, 0)} sessions
                  </span>
                </div>
              {/if}

              <div
                class="mt-4 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]"
              >
                <span class="flex items-center">
                  <Clock size={16} class="mr-1.5" />
                  Updated {formatDistanceToNow(new Date(questionnaire.updated_at))} ago
                </span>
                {#if questionnaire.response_rate_7d > 0}
                  <span
                    class="text-success flex items-center font-medium bg-success/10 px-2 py-0.5 rounded-full"
                  >
                    <TrendingUp size={12} class="mr-1" />
                    +{questionnaire.response_rate_7d}% this week
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Sidebar: Recent Activity -->
    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-[hsl(var(--foreground))]">Recent Activity</h2>

      {#if recentActivity.length > 0}
        <div class="glass-card overflow-hidden">
          <ul class="divide-y divide-[var(--glass-border)]">
            {#each recentActivity as activity}
              <li class="px-4 py-4 hover:bg-[hsl(var(--background))]/30 transition-colors">
                <div class="flex items-start space-x-3">
                  <div class="flex-shrink-0">
                    <div
                      class={`h-8 w-8 rounded-full flex items-center justify-center ${activity.status === 'completed' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}`}
                    >
                      {#if activity.status === 'completed'}
                        <Check size={16} />
                      {:else}
                        <Clock size={16} />
                      {/if}
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                      {activity.participant_email}
                    </p>
                    <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                      {activity.questionnaire_name}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDistanceToNow(new Date(activity.started_at))}
                    </p>
                    {#if activity.response_time_ms}
                      <p class="text-xs font-medium text-primary mt-0.5">
                        {formatTime(activity.response_time_ms)}
                      </p>
                    {/if}
                  </div>
                </div>
              </li>
            {/each}
          </ul>
          <div
            class="bg-[hsl(var(--background))]/30 px-4 py-3 text-center border-t border-[var(--glass-border)]"
          >
            <button class="text-sm font-medium text-primary hover:text-primary/80"
              >View All Activity</button
            >
          </div>
        </div>
      {:else}
        <div class="glass-card p-6 text-center text-[hsl(var(--muted-foreground))]">
          No recent activity to show properly.
        </div>
      {/if}
    </div>
  </div>
</div>
<TourOverlay />
