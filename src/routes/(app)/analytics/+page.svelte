<script lang="ts">
  import { onMount } from 'svelte';
  import type { QuestionnaireSummary, TimeSeriesBucket } from '$lib/types/api';
  import type { AnalyticsPageData } from './+page';
  import { api } from '$lib/services/api';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    data: AnalyticsPageData;
  }

  let { data }: Props = $props();

  let questionnaires = $state<(QuestionnaireSummary & { project_name: string })[]>([]);
  let projects = $state<{ id: string; name: string }[]>([]);
  let sparklineData = $state<Record<string, number[]>>({});

  // Filters
  let filterProject = $state('all');
  let filterStatus = $state('all');
  let filterDateRange = $state('all');

  // Sorting
  let sortColumn = $state<string>('name');
  let sortDirection = $state<'asc' | 'desc'>('asc');

  $effect(() => {
    questionnaires = [...(data.questionnaires ?? [])];
    projects = [...(data.projects ?? [])];
  });

  let filtered = $derived.by(() => {
    let result = [...questionnaires];

    if (filterProject !== 'all') {
      result = result.filter((q) => q.project_id === filterProject);
    }
    if (filterStatus !== 'all') {
      result = result.filter((q) => q.status === filterStatus);
    }
    if (filterDateRange !== 'all') {
      const now = Date.now();
      const cutoffs: Record<string, number> = {
        '7d': 7 * 86400000,
        '30d': 30 * 86400000,
        '90d': 90 * 86400000,
      };
      const cutoff = cutoffs[filterDateRange];
      if (cutoff) {
        result = result.filter((q) => {
          // Use sparkline data presence as a proxy for recent activity
          const values = sparklineData[q.id];
          return values && values.some((v) => v > 0);
        });
      }
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'project':
          cmp = a.project_name.localeCompare(b.project_name);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'sessions':
          cmp = a.total_responses - b.total_responses;
          break;
        case 'completed':
          cmp = a.completed_sessions - b.completed_sessions;
          break;
        case 'completion_rate': {
          const rateA = a.total_responses > 0 ? a.completed_sessions / a.total_responses : 0;
          const rateB = b.total_responses > 0 ? b.completed_sessions / b.total_responses : 0;
          cmp = rateA - rateB;
          break;
        }
        case 'avg_time':
          cmp = (a.avg_completion_time_ms ?? 0) - (b.avg_completion_time_ms ?? 0);
          break;
        default:
          cmp = 0;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  });

  function toggleSort(col: string) {
    if (sortColumn === col) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = col;
      sortDirection = 'asc';
    }
  }

  function sortIndicator(col: string): string {
    if (sortColumn !== col) return '';
    return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
  }

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

  function formatTime(ms: number | null) {
    if (!ms) return '-';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  function completionRate(q: QuestionnaireSummary): string {
    if (q.total_responses === 0) return '-';
    return `${Math.round((q.completed_sessions / q.total_responses) * 100)}%`;
  }

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

  async function loadSparklines() {
    const results: Record<string, number[]> = {};
    for (const q of questionnaires) {
      try {
        const buckets = await api.sessions.timeseries({
          questionnaireId: q.id,
          interval: 'day',
        });
        results[q.id] = buckets.slice(-7).map((b) => b.sessions_started);
      } catch {
        results[q.id] = [];
      }
    }
    sparklineData = results;
  }

  onMount(() => {
    if (questionnaires.length > 0) {
      loadSparklines();
    }
  });
</script>

<div class="min-h-screen">
  <!-- Header -->
  <div class="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
    <h1 class="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
      Cross-Project Analytics
    </h1>
    <p class="mt-2 text-[hsl(var(--muted-foreground))]">
      Overview of all questionnaires across your organization.
    </p>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-4 mb-6">
    <div>
      <label for="filter-project" class="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Project</label>
      <Select
        id="filter-project"
        bind:value={filterProject}
        placeholder=""
      >
        <option value="all">All Projects</option>
        {#each projects as project}
          <option value={project.id}>{project.name}</option>
        {/each}
      </Select>
    </div>
    <div>
      <label for="filter-status" class="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Status</label>
      <Select
        id="filter-status"
        bind:value={filterStatus}
        placeholder=""
      >
        <option value="all">All</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </Select>
    </div>
    <div>
      <label for="filter-date" class="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Date Range</label>
      <Select
        id="filter-date"
        bind:value={filterDateRange}
        placeholder=""
      >
        <option value="all">All Time</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="90d">Last 90 Days</option>
      </Select>
    </div>
    <div class="ml-auto text-sm text-[hsl(var(--muted-foreground))]">
      {filtered.length} questionnaire{filtered.length !== 1 ? 's' : ''}
    </div>
  </div>

  <!-- Table -->
  {#if filtered.length === 0}
    <div class="glass-card p-12 text-center">
      <p class="text-[hsl(var(--muted-foreground))]">
        No questionnaires match the selected filters.
      </p>
    </div>
  {:else}
    <div class="glass-card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/50">
              <th class="px-4 py-3 text-left font-medium text-[hsl(var(--muted-foreground))]">
                <button onclick={() => toggleSort('name')} class="hover:text-[hsl(var(--foreground))]">
                  Name{sortIndicator('name')}
                </button>
              </th>
              <th class="px-4 py-3 text-left font-medium text-[hsl(var(--muted-foreground))]">
                <button onclick={() => toggleSort('project')} class="hover:text-[hsl(var(--foreground))]">
                  Project{sortIndicator('project')}
                </button>
              </th>
              <th class="px-4 py-3 text-left font-medium text-[hsl(var(--muted-foreground))]">
                <button onclick={() => toggleSort('status')} class="hover:text-[hsl(var(--foreground))]">
                  Status{sortIndicator('status')}
                </button>
              </th>
              <th class="px-4 py-3 text-right font-medium text-[hsl(var(--muted-foreground))]">
                <button onclick={() => toggleSort('sessions')} class="hover:text-[hsl(var(--foreground))]">
                  Sessions{sortIndicator('sessions')}
                </button>
              </th>
              <th class="px-4 py-3 text-right font-medium text-[hsl(var(--muted-foreground))]">
                <button onclick={() => toggleSort('completion_rate')} class="hover:text-[hsl(var(--foreground))]">
                  Completion{sortIndicator('completion_rate')}
                </button>
              </th>
              <th class="px-4 py-3 text-right font-medium text-[hsl(var(--muted-foreground))]">
                <button onclick={() => toggleSort('avg_time')} class="hover:text-[hsl(var(--foreground))]">
                  Avg Time{sortIndicator('avg_time')}
                </button>
              </th>
              <th class="px-4 py-3 text-center font-medium text-[hsl(var(--muted-foreground))]">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as q}
              <tr
                class="border-b border-[hsl(var(--border))]/50 hover:bg-[hsl(var(--background))]/30 cursor-pointer transition-colors"
                onclick={() => window.location.href = `/analytics/${q.id}`}
              >
                <td class="px-4 py-3 font-medium text-[hsl(var(--foreground))]">
                  <a href="/analytics/{q.id}" class="hover:underline">{q.name}</a>
                </td>
                <td class="px-4 py-3 text-[hsl(var(--muted-foreground))]">{q.project_name}</td>
                <td class="px-4 py-3">
                  <span class={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getStatusColor(q.status)}`}>
                    {q.status}
                  </span>
                </td>
                <td class="px-4 py-3 text-right font-medium">{q.total_responses}</td>
                <td class="px-4 py-3 text-right font-medium">{completionRate(q)}</td>
                <td class="px-4 py-3 text-right text-[hsl(var(--muted-foreground))]">
                  {formatTime(q.avg_completion_time_ms)}
                </td>
                <td class="px-4 py-3">
                  {#if sparklineData[q.id]?.length && sparklineData[q.id]?.some((v: number) => v > 0)}
                    {@const lineValues = sparklineData[q.id] ?? []}
                    <svg viewBox="0 0 80 20" class="w-20 h-5 mx-auto" preserveAspectRatio="none">
                      <path
                        d={sparklinePath(lineValues, 80, 20)}
                        fill="none"
                        stroke="#6366f1"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  {:else}
                    <span class="text-xs text-[hsl(var(--muted-foreground))] text-center block">-</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
