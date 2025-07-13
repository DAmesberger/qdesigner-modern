<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { formatDistanceToNow } from '$lib/utils/date';
  
  interface Props {
    data: PageData;
  }
  
  let { data }: Props = $props();
  
  const { user, questionnaires, recentActivity, stats } = data;

  function getStatusColor(status: string) {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
    goto(`/designer?id=${id}`);
  }

  function createNewQuestionnaire() {
    goto('/designer');
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-white shadow">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="py-6 md:flex md:items-center md:justify-between">
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Dashboard
          </h1>
          <p class="mt-1 text-sm text-gray-500">
            Welcome back, {user?.full_name || user?.email || 'User'}
          </p>
        </div>
        <div class="mt-4 flex md:mt-0 md:ml-4">
          <button
            on:click={createNewQuestionnaire}
            class="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Questionnaire
          </button>
        </div>
      </div>
    </div>
  </div>

  <main class="px-4 sm:px-6 lg:px-8 py-8">
    <!-- Stats -->
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total Questionnaires</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.totalQuestionnaires}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total Responses</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.totalResponses}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Active Questionnaires</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.activeQuestionnaires}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Avg. Completion Rate</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.avgCompletionRate}%</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Questionnaires Grid -->
    <div class="mt-8">
      <h2 class="text-lg font-medium text-gray-900 mb-4">Your Questionnaires</h2>
      
      {#if questionnaires.length === 0}
        <div class="bg-white shadow rounded-lg p-8 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No questionnaires</h3>
          <p class="mt-1 text-sm text-gray-500">Get started by creating a new questionnaire.</p>
          <div class="mt-6">
            <button
              on:click={createNewQuestionnaire}
              class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <svg class="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              New Questionnaire
            </button>
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each questionnaires as questionnaire}
            <div class="bg-white shadow rounded-lg hover:shadow-lg transition-shadow cursor-pointer" 
                 on:click={() => navigateToQuestionnaire(questionnaire.questionnaire_id)}>
              <div class="p-6">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h3 class="text-lg font-medium text-gray-900 truncate">
                      {questionnaire.name}
                    </h3>
                    {#if questionnaire.description}
                      <p class="mt-1 text-sm text-gray-500 line-clamp-2">
                        {questionnaire.description}
                      </p>
                    {/if}
                  </div>
                  <span class={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(questionnaire.status)}`}>
                    {questionnaire.status}
                  </span>
                </div>

                <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p class="text-gray-500">Responses</p>
                    <p class="font-medium text-gray-900">{questionnaire.total_responses || 0}</p>
                  </div>
                  <div>
                    <p class="text-gray-500">Completed</p>
                    <p class="font-medium text-gray-900">{questionnaire.completed_responses || 0}</p>
                  </div>
                </div>

                {#if questionnaire.avg_completion_time}
                  <div class="mt-3 text-sm">
                    <p class="text-gray-500">Avg. completion time</p>
                    <p class="font-medium text-gray-900">{formatTime(questionnaire.avg_completion_time)}</p>
                  </div>
                {/if}

                <div class="mt-4 flex items-center justify-between text-sm text-gray-500">
                  <span>Updated {formatDistanceToNow(new Date(questionnaire.updated_at))} ago</span>
                  {#if questionnaire.response_rate_7d > 0}
                    <span class="text-green-600">+{questionnaire.response_rate_7d} this week</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Recent Activity -->
    {#if recentActivity.length > 0}
      <div class="mt-8">
        <h2 class="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          <ul class="divide-y divide-gray-200">
            {#each recentActivity as activity}
              <li class="px-4 py-4 sm:px-6">
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900">
                      {activity.questionnaire_name}
                    </p>
                    <p class="text-sm text-gray-500">
                      {activity.participant_email} • {formatDistanceToNow(new Date(activity.started_at))} ago
                    </p>
                  </div>
                  <div class="ml-4 flex items-center">
                    <span class={`text-sm font-medium ${getActivityStatusColor(activity.status)}`}>
                      {activity.status}
                    </span>
                    {#if activity.response_time_ms}
                      <span class="ml-4 text-sm text-gray-500">
                        {formatTime(activity.response_time_ms)}
                      </span>
                    {/if}
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  </main>
</div>