<script lang="ts">
  import AppShell from '$lib/components/AppShell.svelte';
  import Card from '$lib/components/common/Card.svelte';
  import { onMount } from 'svelte';

  let stats = {
    totalUsers: 0,
    activeQuestionnaires: 0,
    totalResponses: 0,
    avgCompletionTime: '0m'
  };

  onMount(() => {
    // Fetch stats from API
    stats = {
      totalUsers: 156,
      activeQuestionnaires: 12,
      totalResponses: 1284,
      avgCompletionTime: '8m 32s'
    };
  });
</script>

<AppShell>
  <div class="p-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
      <p class="mt-2 text-gray-600">Manage your questionnaires and view analytics</p>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
      <Card class="bg-white">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Total Users</dt>
              <dd class="text-lg font-semibold text-gray-900">{stats.totalUsers}</dd>
            </dl>
          </div>
        </div>
      </Card>

      <Card class="bg-white">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Active Questionnaires</dt>
              <dd class="text-lg font-semibold text-gray-900">{stats.activeQuestionnaires}</dd>
            </dl>
          </div>
        </div>
      </Card>

      <Card class="bg-white">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Total Responses</dt>
              <dd class="text-lg font-semibold text-gray-900">{stats.totalResponses}</dd>
            </dl>
          </div>
        </div>
      </Card>

      <Card class="bg-white">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Avg. Completion Time</dt>
              <dd class="text-lg font-semibold text-gray-900">{stats.avgCompletionTime}</dd>
            </dl>
          </div>
        </div>
      </Card>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div class="space-y-3">
          <a href="/admin/users" class="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <svg class="h-5 w-5 text-indigo-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span class="text-gray-900">Manage Users</span>
          </a>
          <a href="/admin/questionnaires" class="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <svg class="h-5 w-5 text-indigo-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span class="text-gray-900">View All Questionnaires</span>
          </a>
          <a href="/admin/analytics" class="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <svg class="h-5 w-5 text-indigo-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span class="text-gray-900">View Analytics</span>
          </a>
          <a href="/admin/settings" class="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <svg class="h-5 w-5 text-indigo-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span class="text-gray-900">System Settings</span>
          </a>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div class="space-y-3">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <div class="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <svg class="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <div class="ml-3">
              <p class="text-sm text-gray-900">New questionnaire created</p>
              <p class="text-xs text-gray-500">Employee Satisfaction Survey - 2 hours ago</p>
            </div>
          </div>
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <div class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <svg class="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <div class="ml-3">
              <p class="text-sm text-gray-900">New user registered</p>
              <p class="text-xs text-gray-500">john.doe@example.com - 3 hours ago</p>
            </div>
          </div>
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <div class="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                <svg class="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div class="ml-3">
              <p class="text-sm text-gray-900">100 responses collected</p>
              <p class="text-xs text-gray-500">Customer Feedback Form - 5 hours ago</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</AppShell>