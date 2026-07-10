<script lang="ts">
  import { Plus, FolderOpen, Users, Calendar, ChevronRight, Search } from 'lucide-svelte';
  import { fly } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { api } from '$lib/services/api';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import ProjectActionsMenu from '$lib/components/ProjectActionsMenu.svelte';
  import { appPaths } from '$lib/routing/paths';
  import { toast } from '$lib/stores/toast';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import type { Project } from '$lib/shared/types/api';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let showCreateModal = $state(false);
  let newProjectName = $state('');
  let newProjectCode = $state('');
  let newProjectDescription = $state('');
  let creating = $state(false);
  let searchQuery = $state('');
  let sortBy = $state<'name' | 'date' | 'questionnaires'>('date');
  let statusFilter = $state<'active' | 'archived' | 'all'>('active');

  // Local, mutable view of the loaded projects so lifecycle actions
  // (rename/archive/delete) reflect immediately without a full reload.
  let projects = $state<Project[]>(data.projects);

  // Org owners/admins may manage every project in the org (server-enforced);
  // the per-card action menu is gated on this.
  const canManage = $derived(data.orgRole === 'owner' || data.orgRole === 'admin');

  function applyProjectUpdate(updated: Project) {
    projects = projects.map((p) => (p.id === updated.id ? updated : p));
  }

  function removeProject(projectId: string) {
    projects = projects.filter((p) => p.id !== projectId);
  }

  let filteredProjects = $derived.by(() => {
    let result = projects;
    if (statusFilter === 'active') {
      result = result.filter((p) => p.status !== 'archived');
    } else if (statusFilter === 'archived') {
      result = result.filter((p) => p.status === 'archived');
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return (
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
          );
        case 'questionnaires':
          return (
            (b.questionnaireCount || 0) -
            (a.questionnaireCount || 0)
          );
        default:
          return 0;
      }
    });
    return result;
  });

  async function createProject() {
    if (!newProjectName.trim() || !newProjectCode.trim() || creating) return;

    creating = true;
    try {
      const project = await api.projects.create({
        organizationId: data.organizationId,
        name: newProjectName,
        code: newProjectCode.toUpperCase(),
        description: newProjectDescription,
      });

      showCreateModal = false;
      await goto(appPaths.project(project.id));
    } catch (error) {
      toast.error('Failed to create project', {
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      creating = false;
    }
  }

  function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
</script>

<div class="min-h-screen bg-background">
  <div class="bg-card shadow-sm border-b border-border">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="py-6 md:flex md:items-center md:justify-between">
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl font-bold leading-7 text-foreground sm:text-3xl sm:truncate">
            Projects
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Manage your research projects and questionnaires
          </p>
        </div>
        <div class="mt-4 flex md:mt-0 md:ml-4">
          <button
            onclick={() => (showCreateModal = true)}
            class="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            <Plus class="-ml-1 mr-2 h-5 w-5" />
            New Project
          </button>
        </div>
      </div>
    </div>
  </div>

  <main class="px-4 sm:px-6 lg:px-8 py-8">
    {#if projects.length === 0}
      <div class="text-center py-12">
        <FolderOpen class="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 class="mt-2 text-sm font-medium text-foreground">No projects</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          Get started by creating a new project.
        </p>
        <div class="mt-6">
          <button
            onclick={() => (showCreateModal = true)}
            class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            <Plus class="-ml-1 mr-2 h-5 w-5" />
            New Project
          </button>
        </div>
      </div>
    {:else}
      <!-- Search and Sort -->
      <div class="flex items-center gap-4 mb-6">
        <div class="relative flex-1 max-w-md">
          <Search
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search projects..."
            bind:value={searchQuery}
            class="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <Select
          bind:value={sortBy}
          placeholder=""
        >
          <option value="date">Newest first</option>
          <option value="name">Name (A-Z)</option>
          <option value="questionnaires">Most questionnaires</option>
        </Select>
        <Select bind:value={statusFilter} placeholder="">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </Select>
      </div>

      {#if filteredProjects.length === 0}
        <div class="text-center py-12">
          <Search class="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 class="mt-2 text-sm font-medium text-foreground">No projects match your search</h3>
          <p class="mt-1 text-sm text-muted-foreground">
            Try a different search term or clear the filter.
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredProjects as project, i}
            <div
              in:fly={{ y: 20, duration: 300, delay: i * 50 }}
              class="relative bg-card overflow-hidden shadow-sm border border-border rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
            >
              {#if canManage}
                <div class="absolute top-4 right-4 z-10">
                  <ProjectActionsMenu
                    {project}
                    {canManage}
                    canDelete={canManage}
                    onRenamed={applyProjectUpdate}
                    onArchived={applyProjectUpdate}
                    onDeleted={removeProject}
                  />
                </div>
              {/if}
              <button
                onclick={() => {
                  if (project.id) {
                    goto(appPaths.project(project.id));
                  }
                }}
                class="block w-full text-left p-6 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary {canManage
                  ? 'pr-12'
                  : ''}"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h3 class="text-lg font-medium text-foreground truncate">
                        {project.name}
                      </h3>
                      {#if project.status === 'archived'}
                        <span
                          class="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground"
                        >
                          Archived
                        </span>
                      {/if}
                    </div>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {project.code}
                    </p>
                  </div>
                  {#if !canManage}
                    <ChevronRight class="h-5 w-5 text-muted-foreground" />
                  {/if}
                </div>

                {#if project.description}
                  <p class="mt-3 text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                {/if}

                <div
                  class="mt-4 flex items-center justify-between text-sm text-muted-foreground"
                >
                  <div class="flex items-center">
                    <Users class="h-4 w-4 mr-1" />
                    <span
                      >{project.questionnaireCount || 0} questionnaires</span
                    >
                  </div>
                  <div class="flex items-center">
                    <Calendar class="h-4 w-4 mr-1" />
                    <span
                      >{formatDate(
                        project.createdAt || new Date().toISOString()
                      )}</span
                    >
                  </div>
                </div>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </main>
</div>

<!-- Create Project Modal -->
<Dialog bind:open={showCreateModal} title="Create New Project" size="md" closable={false}>
  <div class="space-y-4">
    <FormGroup label="Project Name" id="project-name">
      <Input id="project-name" bind:value={newProjectName} placeholder="My Research Project" />
    </FormGroup>

    <FormGroup label="Project Code" id="project-code">
      <Input
        id="project-code"
        value={newProjectCode}
        class="uppercase"
        placeholder="MRP001"
        oninput={(e) => (newProjectCode = e.currentTarget.value.toUpperCase())}
      />
    </FormGroup>

    <FormGroup label="Description (optional)" id="project-description">
      <textarea
        id="project-description"
        bind:value={newProjectDescription}
        rows="3"
        class="mt-1 block w-full rounded-md border border-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-2 bg-background text-foreground"
        placeholder="Brief description of your research project..."
      ></textarea>
    </FormGroup>
  </div>

  {#snippet footer()}
    <div class="flex flex-row-reverse gap-3">
      <Button
        onclick={createProject}
        loading={creating}
        disabled={!newProjectName.trim() || !newProjectCode.trim() || creating}
      >
        Create Project
      </Button>
      <Button variant="outline" disabled={creating} onclick={() => (showCreateModal = false)}>
        Cancel
      </Button>
    </div>
  {/snippet}
</Dialog>
