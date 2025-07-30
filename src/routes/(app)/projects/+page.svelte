<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Plus, FolderOpen, Users, Calendar, ChevronRight } from 'lucide-svelte';
  import type { PageData } from './$types';
  
  interface Props {
    data: PageData;
  }
  
  let { data }: Props = $props();
  let showCreateModal = $state(false);
  let newProjectName = $state('');
  let newProjectCode = $state('');
  let newProjectDescription = $state('');
  
  async function createProject() {
    if (!newProjectName.trim() || !newProjectCode.trim()) return;
    
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newProjectName,
        code: newProjectCode.toUpperCase(),
        description: newProjectDescription,
        organizationId: data.organizationId
      })
    });
    
    if (response.ok) {
      const project = await response.json();
      showCreateModal = false;
      goto(`/projects/${project.id}`);
    }
  }
  
  function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
</script>

<div class="min-h-screen bg-gray-50">
  <div class="bg-white shadow">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="py-6 md:flex md:items-center md:justify-between">
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Projects
          </h1>
          <p class="mt-1 text-sm text-gray-500">
            Manage your research projects and questionnaires
          </p>
        </div>
        <div class="mt-4 flex md:mt-0 md:ml-4">
          <button
            onclick={() => showCreateModal = true}
            class="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus class="-ml-1 mr-2 h-5 w-5" />
            New Project
          </button>
        </div>
      </div>
    </div>
  </div>

  <main class="px-4 sm:px-6 lg:px-8 py-8">
    {#if data.projects.length === 0}
      <div class="text-center py-12">
        <FolderOpen class="mx-auto h-12 w-12 text-gray-400" />
        <h3 class="mt-2 text-sm font-medium text-gray-900">No projects</h3>
        <p class="mt-1 text-sm text-gray-500">Get started by creating a new project.</p>
        <div class="mt-6">
          <button
            onclick={() => showCreateModal = true}
            class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus class="-ml-1 mr-2 h-5 w-5" />
            New Project
          </button>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.projects as project}
          <div class="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
            <button
              onclick={() => goto(`/projects/${project.id}`)}
              class="block w-full text-left p-6 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <h3 class="text-lg font-medium text-gray-900 truncate">
                    {project.name}
                  </h3>
                  <p class="mt-1 text-sm text-gray-500">
                    {project.code}
                  </p>
                </div>
                <ChevronRight class="h-5 w-5 text-gray-400" />
              </div>
              
              {#if project.description}
                <p class="mt-3 text-sm text-gray-600 line-clamp-2">
                  {project.description}
                </p>
              {/if}
              
              <div class="mt-4 flex items-center justify-between text-sm text-gray-500">
                <div class="flex items-center">
                  <Users class="h-4 w-4 mr-1" />
                  <span>{project.questionnaire_count || 0} questionnaires</span>
                </div>
                <div class="flex items-center">
                  <Calendar class="h-4 w-4 mr-1" />
                  <span>{formatDate(project.created_at)}</span>
                </div>
              </div>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div>

<!-- Create Project Modal -->
{#if showCreateModal}
  <div class="fixed z-10 inset-0 overflow-y-auto">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 transition-opacity" aria-hidden="true">
        <div class="absolute inset-0 bg-gray-500 opacity-75"></div>
      </div>

      <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

      <div class="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
        <div>
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
            <FolderOpen class="h-6 w-6 text-blue-600" />
          </div>
          <div class="mt-3 text-center sm:mt-5">
            <h3 class="text-lg leading-6 font-medium text-gray-900">
              Create New Project
            </h3>
            <div class="mt-6 space-y-4">
              <div class="text-left">
                <label for="project-name" class="block text-sm font-medium text-gray-700">
                  Project Name
                </label>
                <input
                  type="text"
                  id="project-name"
                  bind:value={newProjectName}
                  class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="My Research Project"
                />
              </div>
              
              <div class="text-left">
                <label for="project-code" class="block text-sm font-medium text-gray-700">
                  Project Code
                </label>
                <input
                  type="text"
                  id="project-code"
                  bind:value={newProjectCode}
                  class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm uppercase"
                  placeholder="MRP001"
                  oninput={(e) => e.currentTarget.value = e.currentTarget.value.toUpperCase()}
                />
              </div>
              
              <div class="text-left">
                <label for="project-description" class="block text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <textarea
                  id="project-description"
                  bind:value={newProjectDescription}
                  rows="3"
                  class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Brief description of your research project..."
                ></textarea>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
          <button
            onclick={createProject}
            disabled={!newProjectName.trim() || !newProjectCode.trim()}
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:col-start-2 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Project
          </button>
          <button
            onclick={() => showCreateModal = false}
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:col-start-1 sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}