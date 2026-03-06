<script lang="ts">
  import {
    Plus,
    FileText,
    Users,
    Calendar,
    MoreVertical,
    Play,
    Edit,
    BarChart3,
    Search,
  } from 'lucide-svelte';
  import { Modal } from '$lib/components/ui';
  import { appPaths } from '$lib/routing/paths';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let showCreateModal = $state(false);
  let questionnaireName = $state('');
  let questionnaireDescription = $state('');
  let searchQuery = $state('');
  let statusFilter = $state<string>('all');
  let sortBy = $state<'name' | 'date' | 'responses'>('date');

  let filteredQuestionnaires = $derived.by(() => {
    let result = data.questionnaires;
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(term));
    }
    if (statusFilter !== 'all') {
      result = result.filter((item) => item.status === statusFilter);
    }
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return (
            new Date(b.updatedAt || b.updated_at || 0).getTime() -
            new Date(a.updatedAt || a.updated_at || 0).getTime()
          );
        case 'responses':
          return (b.response_count || 0) - (a.response_count || 0);
        default:
          return 0;
      }
    });
    return result;
  });

  async function createQuestionnaire() {
    if (!questionnaireName.trim()) return;

    // Navigate to designer with new questionnaire context
    if (typeof window !== 'undefined') {
      window.location.href = appPaths.projectDesignerNew(data.project.id, {
        name: questionnaireName,
        description: questionnaireDescription,
      });
    }
  }

  function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getStatusBadge(status: string) {
    const classes: Record<string, string> = {
      draft: 'bg-warning/10 text-warning',
      published: 'bg-success/10 text-success',
      archived: 'bg-muted text-muted-foreground',
    };
    return classes[status] || classes['draft'];
  }
</script>

<div class="min-h-screen bg-background">
  <div class="bg-card shadow-sm border-b border-border">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="py-6">
        <!-- Breadcrumb -->
        <nav class="flex mb-4" aria-label="Breadcrumb">
          <ol class="flex items-center space-x-4">
            <li>
              <a
                href={appPaths.projects()}
                class="text-muted-foreground hover:text-foreground">Projects</a
              >
            </li>
            <li class="flex items-center">
              <svg
                class="flex-shrink-0 h-5 w-5 text-muted-foreground"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="ml-4 text-foreground font-medium">{data.project.name}</span>
            </li>
          </ol>
        </nav>

        <!-- Header -->
        <div class="md:flex md:items-center md:justify-between">
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold leading-7 text-foreground sm:text-3xl sm:truncate">
              {data.project.name}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              Project Code: {data.project.code}
            </p>
            {#if data.project.description}
              <p class="mt-2 text-sm text-muted-foreground">
                {data.project.description}
              </p>
            {/if}
          </div>
          <div class="mt-4 flex items-center gap-3 md:mt-0 md:ml-4">
            <a
              href={appPaths.projectAnalytics(data.project.id)}
              class="inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-md text-foreground bg-card hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              data-testid="analytics-link"
            >
              <BarChart3 class="-ml-1 mr-2 h-5 w-5" />
              Analytics
            </a>
            <button
              onclick={() => (showCreateModal = true)}
              class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              data-testid="create-questionnaire-button"
            >
              <Plus class="-ml-1 mr-2 h-5 w-5" />
              New Questionnaire
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <main class="px-4 sm:px-6 lg:px-8 py-8">
    {#if data.questionnaires.length === 0}
      <div class="text-center py-12">
        <FileText class="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 class="mt-2 text-sm font-medium text-foreground">No questionnaires</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          Get started by creating a new questionnaire.
        </p>
        <div class="mt-6">
          <button
            onclick={() => (showCreateModal = true)}
            class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            data-testid="create-questionnaire-empty-button"
          >
            <Plus class="-ml-1 mr-2 h-5 w-5" />
            New Questionnaire
          </button>
        </div>
      </div>
    {:else}
      <!-- Search, Filter, and Sort -->
      <div class="flex flex-wrap items-center gap-4 mb-6">
        <div class="relative flex-1 max-w-md">
          <Search
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search questionnaires..."
            bind:value={searchQuery}
            class="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <Select
          bind:value={statusFilter}
          placeholder=""
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
        <Select
          bind:value={sortBy}
          placeholder=""
        >
          <option value="date">Recently updated</option>
          <option value="name">Name (A-Z)</option>
          <option value="responses">Most responses</option>
        </Select>
      </div>

      {#if filteredQuestionnaires.length === 0}
        <div class="text-center py-12">
          <Search class="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 class="mt-2 text-sm font-medium text-foreground">
            No questionnaires match your filters
          </h3>
          <p class="mt-1 text-sm text-muted-foreground">
            Try a different search term or change the filters.
          </p>
        </div>
      {:else}
        <div class="bg-card shadow-sm border border-border overflow-hidden sm:rounded-md">
          <ul class="divide-y divide-border">
            {#each filteredQuestionnaires as questionnaire}
              <li data-testid={`questionnaire-list-item-${questionnaire.id}`}>
                <div class="px-4 py-4 sm:px-6 hover:bg-muted">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center">
                      <FileText class="h-5 w-5 text-muted-foreground mr-3" />
                      <div>
                        <p class="text-sm font-medium text-foreground">
                          {questionnaire.name}
                        </p>
                        {#if questionnaire.description}
                          <p class="text-sm text-muted-foreground">
                            {questionnaire.description}
                          </p>
                        {/if}
                      </div>
                    </div>
                    <div class="flex items-center space-x-4">
                      <span
                        class={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(questionnaire.status)}`}
                      >
                        {questionnaire.status}
                      </span>
                      <div class="flex items-center space-x-2">
                        {#if questionnaire.status === 'published'}
                          <button
                            onclick={() => {
                              if (typeof window !== 'undefined') {
                                window.location.href = appPaths.projectQuestionnaireRun(
                                  data.project.id,
                                  questionnaire.id
                                );
                              }
                            }}
                            class="text-muted-foreground hover:text-foreground"
                            title="Run questionnaire"
                          >
                            <Play class="h-5 w-5" />
                          </button>
                        {/if}
                        <button
                          onclick={() => {
                            if (typeof window !== 'undefined') {
                              window.location.href = appPaths.projectDesigner(
                                data.project.id,
                                questionnaire.id
                              );
                            }
                          }}
                          class="text-muted-foreground hover:text-foreground"
                          title="Edit questionnaire"
                          data-testid={`questionnaire-edit-${questionnaire.id}`}
                        >
                          <Edit class="h-5 w-5" />
                        </button>
                        <button
                          class="text-muted-foreground hover:text-foreground"
                          title="More options"
                        >
                          <MoreVertical class="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="mt-2 sm:flex sm:justify-between">
                    <div class="sm:flex">
                      <p class="flex items-center text-sm text-muted-foreground">
                        <Users class="flex-shrink-0 mr-1.5 h-4 w-4 text-muted-foreground" />
                        {questionnaire.response_count || 0} responses
                      </p>
                      <p
                        class="mt-2 flex items-center text-sm text-muted-foreground sm:mt-0 sm:ml-6"
                      >
                        <Calendar
                          class="flex-shrink-0 mr-1.5 h-4 w-4 text-muted-foreground"
                        />
                        Updated {formatDate(
                          questionnaire.updatedAt ||
                            questionnaire.updated_at ||
                            new Date().toISOString()
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  </main>
</div>

<!-- Create Questionnaire Modal -->
<Modal bind:open={showCreateModal} title="Create New Questionnaire" size="md">
  <div class="space-y-4">
    <div>
      <label for="questionnaire-name" class="block text-sm font-medium text-foreground mb-1">
        Questionnaire Name
      </label>
      <input
        type="text"
        id="questionnaire-name"
        bind:value={questionnaireName}
        class="mt-1 block w-full rounded-md border border-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-2 bg-background text-foreground"
        placeholder="My Questionnaire"
        data-testid="questionnaire-name-input"
      />
    </div>

    <div>
      <label
        for="questionnaire-description"
        class="block text-sm font-medium text-foreground mb-1"
      >
        Description (optional)
      </label>
      <textarea
        id="questionnaire-description"
        bind:value={questionnaireDescription}
        rows="3"
        class="mt-1 block w-full rounded-md border border-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-2 bg-background text-foreground"
        placeholder="Brief description of your questionnaire..."
        data-testid="questionnaire-description-input"
      ></textarea>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex flex-row-reverse gap-3">
      <button
        onclick={createQuestionnaire}
        disabled={!questionnaireName.trim()}
        class="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="questionnaire-create-confirm"
      >
        Create & Edit
      </button>
      <button
        onclick={() => (showCreateModal = false)}
        class="inline-flex justify-center rounded-md border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:text-sm"
      >
        Cancel
      </button>
    </div>
  {/snippet}
</Modal>
