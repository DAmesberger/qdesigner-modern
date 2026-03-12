<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import { formatDistanceToNow } from '$lib/shared/utils/date';
  import type { DashboardQuestionnaire } from '$lib/types/dashboard';
  import { appPaths } from '$lib/routing/paths';
  import { ws, type WsEvent } from '$lib/services/ws';
  import { api } from '$lib/services/api';
  import TourOverlay from '$lib/help/components/TourOverlay.svelte';
  import {
    Activity,
    ArrowRight,
    BarChart3,
    CheckCircle2,
    Clock3,
    FileText,
    FolderKanban,
    PieChart,
    PlayCircle,
    Plus,
    Sparkles,
    TrendingUp,
    Users,
    Zap,
  } from 'lucide-svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let user = $derived(data.user);
  let questionnaires = $state<DashboardQuestionnaire[]>([]);
  let recentActivity = $derived(data.recentActivity);
  let stats = $state({
    totalQuestionnaires: 0,
    totalResponses: 0,
    activeQuestionnaires: 0,
    avgCompletionRate: 0,
  });
  let sparklineData = $state<Record<string, number[]>>({});

  let displayName = $derived(user?.fullName || user?.email?.split('@')[0] || 'Researcher');
  let statCards = $derived.by(() => [
    {
      label: 'Questionnaires',
      value: stats.totalQuestionnaires,
      detail: 'Study workspaces ready to edit',
      icon: FileText,
      iconClass: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    },
    {
      label: 'Responses',
      value: stats.totalResponses,
      detail: 'Captured across all running studies',
      icon: Users,
      iconClass: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    },
    {
      label: 'Active',
      value: stats.activeQuestionnaires,
      detail: 'Questionnaires currently collecting data',
      icon: Zap,
      iconClass: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    },
    {
      label: 'Completion rate',
      value: `${stats.avgCompletionRate}%`,
      detail: 'Average finish rate across submissions',
      icon: PieChart,
      iconClass: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
    },
  ]);

  const welcomeMessages = [
    'Open a project, launch a questionnaire, and keep the whole workflow visible.',
    'Keep study setup, fieldwork, and review in the same workspace.',
    'Your next questionnaire should start from a proper dashboard, not a dead end.',
  ];
  const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];

  $effect(() => {
    questionnaires = [...data.questionnaires];
    stats = { ...data.stats };
  });

  function sparklinePath(values: number[], width: number, height: number): string {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const step = width / (values.length - 1);

    return values
      .map((value, index) => {
        const x = index * step;
        const y = height - (value / max) * height;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  async function loadSparklines() {
    const results: Record<string, number[]> = {};

    for (const questionnaire of questionnaires) {
      try {
        const buckets = await api.sessions.timeseries({
          questionnaireId: questionnaire.questionnaire_id,
          interval: 'day',
        });
        results[questionnaire.questionnaire_id] = buckets.slice(-7).map((bucket) => bucket.sessions_started);
      } catch {
        results[questionnaire.questionnaire_id] = [];
      }
    }

    sparklineData = results;
  }

  let wsUnsubscribes: (() => void)[] = [];

  function subscribeRealtime() {
    for (const questionnaire of questionnaires) {
      const channel = `questionnaire:${questionnaire.questionnaire_id}`;
      const unsubscribe = ws.subscribe(channel, (message: WsEvent) => {
        if (message.event === 'response.submitted') {
          const payload = message.payload as { questionnaire_id?: string; count?: number };
          const count = payload.count ?? 1;

          questionnaires = questionnaires.map((item) =>
            item.questionnaire_id === payload.questionnaire_id
              ? { ...item, total_responses: item.total_responses + count }
              : item
          );
          stats = { ...stats, totalResponses: stats.totalResponses + count };
        }

        if (message.event === 'session.created') {
          const payload = message.payload as { questionnaire_id?: string };
          const questionnaireId = payload.questionnaire_id;

          if (questionnaireId && sparklineData[questionnaireId]) {
            const previous = sparklineData[questionnaireId] ?? [];
            const next = [...previous];
            const lastIndex = next.length - 1;

            if (lastIndex >= 0) {
              next[lastIndex] = (next[lastIndex] ?? 0) + 1;
            } else {
              next.push(1);
            }

            sparklineData = { ...sparklineData, [questionnaireId]: next };
          }
        }

        if (message.event === 'session.completed') {
          const payload = message.payload as { questionnaire_id?: string };
          questionnaires = questionnaires.map((item) =>
            item.questionnaire_id === payload.questionnaire_id
              ? { ...item, completed_responses: (item.completed_responses ?? 0) + 1 }
              : item
          );
        }
      });

      wsUnsubscribes.push(unsubscribe);
    }
  }

  onMount(() => {
    if (questionnaires.length > 0) {
      subscribeRealtime();
      loadSparklines();
    }
  });

  onDestroy(() => {
    for (const unsubscribe of wsUnsubscribes) unsubscribe();
    wsUnsubscribes = [];
  });

  async function navigateTo(url: string) {
    try {
      await goto(url);
    } catch {
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'published':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'draft':
        return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
      case 'archived':
        return 'border-border bg-muted text-muted-foreground';
      default:
        return 'border-border bg-muted text-muted-foreground';
    }
  }

  function getActivityStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'in_progress':
        return 'bg-sky-500/10 text-sky-700 dark:text-sky-300';
      case 'abandoned':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
      default:
        return 'bg-muted text-muted-foreground';
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

  function formatStatus(status: string) {
    return status.replace('_', ' ');
  }

  function openProjects() {
    void navigateTo(appPaths.projects());
  }

  function openRuntime() {
    void navigateTo('/fillout');
  }

  function createNewQuestionnaire() {
    void navigateTo(appPaths.projects());
  }

  function navigateToQuestionnaire(projectId: string, questionnaireId: string) {
    if (!projectId) {
      void navigateTo(appPaths.projects());
      return;
    }

    void navigateTo(appPaths.projectDesigner(projectId, questionnaireId));
  }
</script>

<div class="relative space-y-8 pb-10" data-tour="dashboard-overview">
  <div class="pointer-events-none absolute inset-x-0 top-[-5rem] -z-10 h-[30rem] overflow-hidden">
    <div class="absolute left-[8%] top-12 h-64 w-64 rounded-full bg-sky-500/12 blur-3xl"></div>
    <div class="absolute right-[10%] top-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"></div>
    <div class="absolute left-1/2 top-0 h-96 w-[44rem] -translate-x-1/2 bg-[radial-gradient(circle,_rgba(56,189,248,0.12),_transparent_62%)]"></div>
  </div>

  <section class="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
    <div class="relative overflow-hidden rounded-[32px] border border-border/70 bg-card/95 p-8 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.4)]">
      <div class="absolute inset-y-0 right-0 w-80 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_68%)]"></div>
      <div class="relative flex h-full flex-col justify-between gap-8">
        <div class="space-y-5">
          <div class="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-4 py-2 text-sm font-medium text-muted-foreground">
            <Sparkles class="h-4 w-4 text-primary" />
            Research workspace
          </div>

          <div>
            <h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Welcome back, {displayName}.
            </h1>
            <p class="mt-4 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
              {randomMessage}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            data-tour="new-questionnaire"
            onclick={createNewQuestionnaire}
            class="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <Plus class="h-4 w-4" />
            New questionnaire
          </button>

          <button
            type="button"
            onclick={openProjects}
            class="inline-flex items-center gap-2 rounded-2xl border border-border bg-background/90 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
          >
            <FolderKanban class="h-4 w-4 text-primary" />
            Open projects
          </button>

          <button
            type="button"
            onclick={openRuntime}
            class="inline-flex items-center gap-2 rounded-2xl border border-border bg-background/90 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
          >
            <PlayCircle class="h-4 w-4 text-primary" />
            Test runtime
          </button>
        </div>
      </div>
    </div>

    <aside class="rounded-[32px] border border-border/70 bg-card/92 p-6 shadow-sm">
      <p class="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Quick focus</p>
      <h2 class="mt-3 text-2xl font-semibold tracking-tight text-foreground">
        Run the next study without hunting through the UI.
      </h2>
      <p class="mt-3 text-sm leading-7 text-muted-foreground">
        The dashboard should make the next action obvious: create work, organize it, and monitor it from the same screen.
      </p>

      <div class="mt-6 space-y-3">
        <button
          type="button"
          onclick={createNewQuestionnaire}
          class="flex w-full items-center justify-between rounded-3xl border border-border/70 bg-background/80 px-4 py-4 text-left transition hover:bg-accent"
        >
          <div>
            <p class="text-sm font-semibold text-foreground">Start a questionnaire</p>
            <p class="mt-1 text-sm text-muted-foreground">Choose a project and open the visual designer.</p>
          </div>
          <ArrowRight class="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          type="button"
          onclick={openProjects}
          class="flex w-full items-center justify-between rounded-3xl border border-border/70 bg-background/80 px-4 py-4 text-left transition hover:bg-accent"
        >
          <div>
            <p class="text-sm font-semibold text-foreground">Manage projects</p>
            <p class="mt-1 text-sm text-muted-foreground">Group related questionnaires and team ownership cleanly.</p>
          </div>
          <ArrowRight class="h-4 w-4 text-muted-foreground" />
        </button>

        <div class="rounded-3xl border border-border/70 bg-muted/35 p-4">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl bg-primary/10 p-3 text-primary">
              <BarChart3 class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-semibold text-foreground">Live snapshot</p>
              <p class="text-sm text-muted-foreground">
                {stats.totalResponses} responses across {stats.totalQuestionnaires} questionnaires.
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </section>

  <section class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
    {#each statCards as stat}
      <article class="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-muted-foreground">{stat.label}</p>
            <p class="mt-3 text-4xl font-semibold tracking-tight text-foreground">{stat.value}</p>
          </div>
          <div class={`rounded-2xl p-3 ${stat.iconClass}`}>
            <stat.icon class="h-6 w-6" />
          </div>
        </div>
        <p class="mt-4 text-sm leading-6 text-muted-foreground">{stat.detail}</p>
      </article>
    {/each}
  </section>

  <section class="grid gap-6 2xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.95fr)]">
    <div class="rounded-[32px] border border-border/70 bg-card/92 shadow-sm" data-tour="dashboard-questionnaires">
      <div class="flex flex-col gap-4 border-b border-border/70 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Questionnaires</p>
          <h2 class="mt-2 text-2xl font-semibold tracking-tight text-foreground">Your active work</h2>
          <p class="mt-2 text-sm leading-7 text-muted-foreground">
            Open existing questionnaires, monitor activity, and jump straight into the designer.
          </p>
        </div>

        <button
          type="button"
          onclick={createNewQuestionnaire}
          class="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <Plus class="h-4 w-4" />
          New questionnaire
        </button>
      </div>

      {#if questionnaires.length === 0}
        <div class="grid gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div class="rounded-[28px] border border-dashed border-border bg-background/70 p-8">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <FileText class="h-6 w-6" />
            </div>
            <h3 class="mt-6 text-2xl font-semibold tracking-tight text-foreground">No questionnaires yet</h3>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Start from a project and create the first questionnaire there. This dashboard will then become the place to return for edits, live response tracking, and recent activity.
            </p>

            <div class="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onclick={createNewQuestionnaire}
                class="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Plus class="h-4 w-4" />
                Create questionnaire
              </button>
              <button
                type="button"
                onclick={openProjects}
                class="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
              >
                <FolderKanban class="h-4 w-4 text-primary" />
                Go to projects
              </button>
            </div>
          </div>

          <div class="rounded-[28px] border border-border/70 bg-muted/35 p-6">
            <p class="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">What belongs here</p>
            <div class="mt-5 space-y-4">
              <div class="rounded-3xl border border-border/70 bg-background/80 p-4">
                <p class="text-sm font-semibold text-foreground">Drafts and published studies</p>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">Each card becomes a direct route back into the designer.</p>
              </div>
              <div class="rounded-3xl border border-border/70 bg-background/80 p-4">
                <p class="text-sm font-semibold text-foreground">Completion and response volume</p>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">Quick operational context without opening analytics first.</p>
              </div>
              <div class="rounded-3xl border border-border/70 bg-background/80 p-4">
                <p class="text-sm font-semibold text-foreground">Recent updates</p>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">Useful once participants begin flowing through the system.</p>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="space-y-4 p-6">
          {#each questionnaires as questionnaire}
            <button
              type="button"
              class="group block w-full overflow-hidden rounded-[28px] border border-border/70 bg-background/75 p-6 text-left transition hover:border-primary/40 hover:bg-accent/40"
              onclick={() =>
                navigateToQuestionnaire(
                  questionnaire.project_id || questionnaire.projectId || '',
                  questionnaire.questionnaire_id
                )}
            >
              <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-3">
                    <h3 class="text-xl font-semibold tracking-tight text-foreground group-hover:text-primary">
                      {questionnaire.name}
                    </h3>
                    <span class={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getStatusColor(questionnaire.status)}`}>
                      {formatStatus(questionnaire.status)}
                    </span>
                  </div>

                  {#if questionnaire.description}
                    <p class="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                      {questionnaire.description}
                    </p>
                  {/if}
                </div>

                <div class="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
                  Open designer
                  <ArrowRight class="h-4 w-4" />
                </div>
              </div>

              <div class="mt-6 grid gap-4 md:grid-cols-3 xl:max-w-2xl">
                <div class="rounded-3xl border border-border/70 bg-card/90 p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Responses</p>
                  <p class="mt-3 text-2xl font-semibold tracking-tight text-foreground">{questionnaire.total_responses || 0}</p>
                </div>
                <div class="rounded-3xl border border-border/70 bg-card/90 p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Completed</p>
                  <p class="mt-3 text-2xl font-semibold tracking-tight text-foreground">{questionnaire.completed_responses || 0}</p>
                </div>
                <div class="rounded-3xl border border-border/70 bg-card/90 p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg. time</p>
                  <p class="mt-3 text-2xl font-semibold tracking-tight text-foreground">{formatTime(questionnaire.avg_completion_time ?? 0)}</p>
                </div>
              </div>

              <div class="mt-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                {#if sparklineData[questionnaire.questionnaire_id]?.length}
                  {@const values = sparklineData[questionnaire.questionnaire_id] ?? []}
                  <div class="flex min-w-0 flex-1 items-center gap-3 rounded-3xl border border-border/70 bg-card/80 px-4 py-3">
                    <div class="rounded-2xl bg-primary/10 p-2 text-primary">
                      <TrendingUp class="h-4 w-4" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">7-day trend</p>
                      <svg viewBox="0 0 160 30" class="mt-2 h-8 w-full" preserveAspectRatio="none">
                        <path
                          d={sparklinePath(values, 160, 30)}
                          fill="none"
                          stroke="currentColor"
                          class="text-primary"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </div>
                    <p class="text-sm font-semibold text-foreground">
                      {values.reduce((total, value) => total + value, 0)} sessions
                    </p>
                  </div>
                {/if}

                <div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span class="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1.5">
                    <Clock3 class="h-4 w-4" />
                    Updated {formatDistanceToNow(new Date(questionnaire.updated_at))} ago
                  </span>
                  {#if questionnaire.response_rate_7d > 0}
                    <span class="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                      <TrendingUp class="h-4 w-4" />
                      +{questionnaire.response_rate_7d}% this week
                    </span>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <aside class="rounded-[32px] border border-border/70 bg-card/92 shadow-sm">
      <div class="border-b border-border/70 px-6 py-6">
        <p class="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Recent activity</p>
        <h2 class="mt-2 text-2xl font-semibold tracking-tight text-foreground">Live study movement</h2>
        <p class="mt-2 text-sm leading-7 text-muted-foreground">
          Keep an eye on submissions, participant progress, and what needs attention next.
        </p>
      </div>

      <div class="p-6">
        {#if recentActivity.length > 0}
          <ul class="space-y-4">
            {#each recentActivity as activity}
              <li class="rounded-[28px] border border-border/70 bg-background/75 p-4">
                <div class="flex items-start gap-3">
                  <div class={`rounded-2xl p-3 ${getActivityStatusColor(activity.status)}`}>
                    {#if activity.status === 'completed'}
                      <CheckCircle2 class="h-5 w-5" />
                    {:else if activity.status === 'in_progress'}
                      <Activity class="h-5 w-5" />
                    {:else}
                      <Clock3 class="h-5 w-5" />
                    {/if}
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-semibold text-foreground">{activity.participant_email}</p>
                      <span class={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getActivityStatusColor(activity.status)}`}>
                        {formatStatus(activity.status)}
                      </span>
                    </div>
                    <p class="mt-2 text-sm leading-6 text-muted-foreground">{activity.questionnaire_name}</p>
                    <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span class="inline-flex items-center gap-1.5">
                        <Clock3 class="h-3.5 w-3.5" />
                        {formatDistanceToNow(new Date(activity.started_at))} ago
                      </span>
                      {#if activity.response_time_ms}
                        <span class="inline-flex items-center gap-1.5">
                          <TrendingUp class="h-3.5 w-3.5" />
                          {formatTime(activity.response_time_ms)}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="rounded-[28px] border border-dashed border-border bg-background/70 p-8 text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <Activity class="h-6 w-6" />
            </div>
            <h3 class="mt-5 text-xl font-semibold tracking-tight text-foreground">No recent activity yet</h3>
            <p class="mt-3 text-sm leading-7 text-muted-foreground">
              Once sessions start, this column becomes the quick operational feed for submissions and progress.
            </p>
          </div>
        {/if}
      </div>
    </aside>
  </section>
</div>

<TourOverlay />
