<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Plus, FolderOpen, Users, Calendar, ChevronRight } from 'lucide-svelte';
  import { supabase } from '$lib/services/supabase';
  import { Modal } from '$lib/components/ui';
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

    try {
      // Get the current session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      // Get the public user ID
      const { data: publicUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', session.user.id)
        .single();

      if (!publicUser) {
        console.error('Public user not found');
        return;
      }

      // Create the project directly with Supabase client
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          organization_id: data.organizationId,
          name: newProjectName,
          code: newProjectCode.toUpperCase(),
          description: newProjectDescription,
          created_by: publicUser.id,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating project:', error);
        return;
      }

      // Add creator as project owner
      await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: publicUser.id,
        role: 'owner',
      });

      showCreateModal = false;
      if (typeof window !== 'undefined') {
        window.location.href = `/projects/${project.id}`;
      }
    } catch (error) {
      console.error('Error in createProject:', error);
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

<div class="min-h-screen bg-gray-50">
  <div class="bg-white shadow">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="py-6 md:flex md:items-center md:justify-between">
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Projects
          </h1>
          <p class="mt-1 text-sm text-gray-500">Manage your research projects and questionnaires</p>
        </div>
        <div class="mt-4 flex md:mt-0 md:ml-4">
          <button
            onclick={() => (showCreateModal = true)}
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
            onclick={() => (showCreateModal = true)}
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
              onclick={() => {
                const url = `/projects/${project.id}`;
                console.log('Navigating to:', url, 'project.id:', project.id);
                if (project.id) {
                  // Use window.location as a workaround for the goto issue
                  window.location.href = url;
                } else {
                  console.error('Project ID is undefined');
                }
              }}
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
<Modal bind:open={showCreateModal} title="Create New Project" size="md">
  <div class="space-y-4">
    <div>
      <label for="project-name" class="block text-sm font-medium text-foreground mb-1">
        Project Name
      </label>
      <input
        type="text"
        id="project-name"
        bind:value={newProjectName}
        class="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-2"
        placeholder="My Research Project"
      />
    </div>

    <div>
      <label for="project-code" class="block text-sm font-medium text-foreground mb-1">
        Project Code
      </label>
      <input
        type="text"
        id="project-code"
        bind:value={newProjectCode}
        class="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm uppercase px-3 py-2"
        placeholder="MRP001"
        oninput={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase())}
      />
    </div>

    <div>
      <label for="project-description" class="block text-sm font-medium text-foreground mb-1">
        Description (optional)
      </label>
      <textarea
        id="project-description"
        bind:value={newProjectDescription}
        rows="3"
        class="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-2"
        placeholder="Brief description of your research project..."
      ></textarea>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex flex-row-reverse gap-3">
      <button
        onclick={createProject}
        disabled={!newProjectName.trim() || !newProjectCode.trim()}
        class="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Create Project
      </button>
      <button
        onclick={() => (showCreateModal = false)}
        class="inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:text-sm"
      >
        Cancel
      </button>
    </div>
  {/snippet}
</Modal>
