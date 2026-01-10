<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { formatDistanceToNow } from '$lib/shared/utils/date';
  import type {
    DashboardQuestionnaire,
    DashboardActivity,
    QuestionnaireStats,
    QuestionnaireListItem,
  } from '$lib/types/dashboard';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const { user, questionnaires, recentActivity, stats } = data;

  function getStatusColor(status: string) {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'draft':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'archived':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  function getActivityStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'in_progress':
        return 'text-blue-600';
      case 'abandoned':
        return 'text-red-600';
      default:
        return 'text-gray-600';
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

  function navigateToQuestionnaire(id: string) {
    // Navigate to the designer with a test project ID
    // Using a test project ID for now
    const testProjectId = 'test-project-1';
    const url = `/projects/${testProjectId}/designer/${id}`;
    console.log('Navigating to:', url, 'with id:', id);

    // Use window.location for now to bypass the goto issue
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  function createNewQuestionnaire() {
    // Navigate to projects page to select/create project first
    if (typeof window !== 'undefined') {
      window.location.href = '/projects';
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
        >{user?.full_name || user?.email?.split('@')[0] || 'User'}</span
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
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">Total Questionnaires</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">
          {stats.totalQuestionnaires}
        </p>
      </div>
      <div class="p-3 bg-indigo-500/10 rounded-full text-indigo-600">
        <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
    </div>

    <div
      class="glass-card p-6 flex items-center justify-between border-l-4 border-l-purple-500 animate-in zoom-in duration-300 delay-100"
    >
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">Total Responses</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">{stats.totalResponses}</p>
      </div>
      <div class="p-3 bg-purple-500/10 rounded-full text-purple-600">
        <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>
    </div>

    <div
      class="glass-card p-6 flex items-center justify-between border-l-4 border-l-emerald-500 animate-in zoom-in duration-300 delay-200"
    >
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">Active</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">
          {stats.activeQuestionnaires}
        </p>
      </div>
      <div class="p-3 bg-emerald-500/10 rounded-full text-emerald-600">
        <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
    </div>

    <div
      class="glass-card p-6 flex items-center justify-between border-l-4 border-l-amber-500 animate-in zoom-in duration-300 delay-300"
    >
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">Avg. Completion</p>
        <p class="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">
          {stats.avgCompletionRate}%
        </p>
      </div>
      <div class="p-3 bg-amber-500/10 rounded-full text-amber-600">
        <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
          />
        </svg>
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
          <svg class="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Questionnaire
        </button>
      </div>

      {#if questionnaires.length === 0}
        <div class="glass-card p-12 text-center">
          <div
            class="mx-auto h-16 w-16 text-gray-400 bg-gray-50 rounded-full flex items-center justify-center mb-4"
          >
            <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 class="mt-2 text-lg font-medium text-gray-900">No questionnaires yet</h3>
          <p class="mt-1 text-gray-500">
            Get started by creating a new questionnaire to gather insights.
          </p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each questionnaires as questionnaire}
            <button
              type="button"
              class="glass-card p-6 w-full text-left group hover:bg-[hsl(var(--layer-surface))]/50 border-l-4 border-l-transparent hover:border-l-indigo-500"
              onclick={() => navigateToQuestionnaire(questionnaire.questionnaire_id)}
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <h3
                    class="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-indigo-600 transition-colors"
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

              <div
                class="mt-4 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]"
              >
                <span class="flex items-center">
                  <svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Updated {formatDistanceToNow(new Date(questionnaire.updated_at))} ago
                </span>
                {#if questionnaire.response_rate_7d > 0}
                  <span
                    class="text-green-600 flex items-center font-medium bg-green-50 px-2 py-0.5 rounded-full"
                  >
                    <svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
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
                      class={`h-8 w-8 rounded-full flex items-center justify-center ${activity.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}
                    >
                      {#if activity.status === 'completed'}
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      {:else}
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
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
                      <p class="text-xs font-medium text-indigo-600 mt-0.5">
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
            <button class="text-sm font-medium text-indigo-600 hover:text-indigo-500"
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
