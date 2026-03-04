<script lang="ts">
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import type { DashboardSummary } from '$lib/types/api';
  import {
    Users,
    FileText,
    BarChart3,
    Clock,
    Mail,
    Globe,
    ClipboardList,
    Settings,
    CheckCircle,
    Activity,
  } from 'lucide-svelte';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let dashboard = $state<DashboardSummary | null>(null);

  $effect(() => {
    loadData();
  });

  async function loadData() {
    try {
      const user = await auth.getUser();
      if (!user) return;

      const orgs = await api.organizations.list();
      const org = orgs?.[0];
      if (!org) {
        error = 'You must be part of an organization to view the dashboard';
        loading = false;
        return;
      }

      dashboard = await api.sessions.dashboard(org.id);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      error = 'Failed to load dashboard data';
    } finally {
      loading = false;
    }
  }

  function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 30) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatCompletionTime(ms: number | null): string {
    if (ms == null || ms === 0) return '--';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min === 0) return `${sec}s`;
    return `${min}m ${sec}s`;
  }

  function formatRate(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'in_progress':
        return 'text-blue-500';
      case 'abandoned':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'abandoned':
        return 'Abandoned';
      default:
        return status;
    }
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground">Admin Dashboard</h1>
    <p class="mt-2 text-muted-foreground">Manage your questionnaires and view analytics</p>
  </div>

  {#if error}
    <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive mb-6">
      {error}
    </div>
  {/if}

  <!-- Stats Grid -->
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
    {#if loading}
      {#each Array(4) as _}
        <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center">
            <div class="h-10 w-10 animate-pulse rounded-lg bg-muted"></div>
            <div class="ml-4 flex-1">
              <div class="h-3 w-24 animate-pulse rounded bg-muted mb-2"></div>
              <div class="h-6 w-16 animate-pulse rounded bg-muted"></div>
            </div>
          </div>
        </div>
      {/each}
    {:else if dashboard}
      <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div class="flex items-center">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList class="h-5 w-5 text-primary" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-muted-foreground">Total Questionnaires</p>
            <p class="text-2xl font-semibold text-foreground">{dashboard.stats.total_questionnaires}</p>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div class="flex items-center">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText class="h-5 w-5 text-primary" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-muted-foreground">Total Responses</p>
            <p class="text-2xl font-semibold text-foreground">{dashboard.stats.total_responses}</p>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div class="flex items-center">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 class="h-5 w-5 text-primary" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-muted-foreground">Active Questionnaires</p>
            <p class="text-2xl font-semibold text-foreground">{dashboard.stats.active_questionnaires}</p>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div class="flex items-center">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <CheckCircle class="h-5 w-5 text-primary" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-muted-foreground">Avg. Completion Rate</p>
            <p class="text-2xl font-semibold text-foreground">{formatRate(dashboard.stats.avg_completion_rate)}</p>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Quick Actions -->
    <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h3 class="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
      <div class="space-y-1">
        <a href="/admin/users" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <Users class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">Manage Users</span>
        </a>
        <a href="/admin/invitations" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <Mail class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">Manage Invitations</span>
        </a>
        <a href="/admin/domains" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <Globe class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">Domain Auto-Join</span>
        </a>
        <a href="/projects" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <ClipboardList class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">View All Questionnaires</span>
        </a>
        <a href="/projects" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <BarChart3 class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">View Analytics</span>
        </a>
        <a href="/settings" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <Settings class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">System Settings</span>
        </a>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h3 class="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
      {#if loading}
        <div class="space-y-4">
          {#each Array(3) as _}
            <div class="flex items-start">
              <div class="h-8 w-8 animate-pulse rounded-full bg-muted"></div>
              <div class="ml-3 flex-1">
                <div class="h-3 w-40 animate-pulse rounded bg-muted mb-2"></div>
                <div class="h-2 w-28 animate-pulse rounded bg-muted"></div>
              </div>
            </div>
          {/each}
        </div>
      {:else if dashboard && dashboard.recent_activity.length > 0}
        <div class="space-y-3">
          {#each dashboard.recent_activity as activity}
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Activity class="h-4 w-4 {statusColor(activity.status)}" />
                </div>
              </div>
              <div class="ml-3 min-w-0">
                <p class="text-sm text-foreground truncate">{activity.questionnaire_name}</p>
                <p class="text-xs text-muted-foreground">
                  <span class={statusColor(activity.status)}>{statusLabel(activity.status)}</span>
                  {#if activity.started_at}
                    &middot; {formatRelativeTime(activity.started_at)}
                  {/if}
                  {#if activity.participant_id}
                    &middot; {activity.participant_id}
                  {/if}
                </p>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">No recent activity</p>
      {/if}
    </div>
  </div>

  <!-- Questionnaires Table -->
  {#if loading}
    <div class="mt-6 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div class="h-5 w-40 animate-pulse rounded bg-muted mb-4"></div>
      <div class="space-y-3">
        {#each Array(3) as _}
          <div class="h-10 w-full animate-pulse rounded bg-muted"></div>
        {/each}
      </div>
    </div>
  {:else if dashboard && dashboard.questionnaires.length > 0}
    <div class="mt-6 rounded-lg border border-border bg-card p-5 shadow-sm">
      <h3 class="text-lg font-semibold text-foreground mb-4">Questionnaires</h3>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border text-left">
              <th class="pb-3 text-sm font-medium text-muted-foreground">Name</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground">Status</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground text-right">Responses</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground text-right">Completed</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground text-right">Avg. Time</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each dashboard.questionnaires as q}
              <tr class="hover:bg-muted/50 transition-colors">
                <td class="py-3 text-sm font-medium text-foreground">{q.name}</td>
                <td class="py-3">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                    {q.status === 'published' ? 'bg-green-500/10 text-green-500' : q.status === 'draft' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-muted text-muted-foreground'}">
                    {q.status}
                  </span>
                </td>
                <td class="py-3 text-sm text-muted-foreground text-right">{q.total_responses}</td>
                <td class="py-3 text-sm text-muted-foreground text-right">{q.completed_sessions}</td>
                <td class="py-3 text-sm text-muted-foreground text-right">{formatCompletionTime(q.avg_completion_time_ms)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
