<script lang="ts">
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import type { DashboardSummary } from '$lib/shared/types/api';
  import {
    Users,
    FileText,
    BarChart3,
    Mail,
    Globe,
    ClipboardList,
    Settings,
    CheckCircle,
    ScrollText,
    ShieldCheck,
    KeyRound,
    Terminal,
    Building2,
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

  function formatRate(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground">Admin Dashboard</h1>
    <p class="mt-2 text-muted-foreground">
      Organization overview and quick access to management tools
    </p>
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

  <div class="grid grid-cols-1 gap-6">
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
        <a href="/admin/roles" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <ShieldCheck class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">Roles &amp; Permissions</span>
        </a>
        <a href="/admin/sso" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <KeyRound class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">SSO / Single Sign-On</span>
        </a>
        <a href="/admin/api-keys" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <Terminal class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">API Keys</span>
        </a>
        <a href="/admin/audit" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <ScrollText class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">Audit Log</span>
        </a>
        <a href="/admin/data-privacy" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <ShieldCheck class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">Data &amp; Privacy</span>
        </a>
        <a href="/projects" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <ClipboardList class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">View All Questionnaires</span>
        </a>
        <a href="/analytics" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <BarChart3 class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">View Analytics</span>
        </a>
        <a href="/admin/settings" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <Building2 class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">Organization Settings</span>
        </a>
        <a href="/settings" class="flex items-center p-3 rounded-lg transition-all duration-200 hover:bg-muted hover:translate-x-1">
          <Settings class="h-5 w-5 text-primary mr-3" />
          <span class="text-foreground">My Settings</span>
        </a>
      </div>
    </div>
  </div>
</div>
