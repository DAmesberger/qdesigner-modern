<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Plus, FileText, Users, Calendar, MoreVertical, Play, Edit, Copy, Archive } from 'lucide-svelte';
  import type { PageData } from './$types';
  
  interface Props {
    data: PageData;
  }
  
  let { data }: Props = $props();
  let showCreateModal = $state(false);
  let questionnaireName = $state('');
  let questionnaireDescription = $state('');
  
  async function createQuestionnaire() {
    if (!questionnaireName.trim()) return;
    
    // Navigate to designer with new questionnaire context
    goto(`/projects/${data.project.id}/designer/new?name=${encodeURIComponent(questionnaireName)}&description=${encodeURIComponent(questionnaireDescription)}`);
  }
  
  function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  
  function getStatusBadge(status: string) {
    const classes = {
      'draft': 'bg-yellow-100 text-yellow-800',
      'published': 'bg-green-100 text-green-800',
      'archived': 'bg-gray-100 text-gray-800'
    };
    return classes[status] || classes['draft'];
  }
</script>

<div class="min-h-screen bg-gray-50">
  <div class="bg-white shadow">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="py-6">
        <!-- Breadcrumb -->
        <nav class="flex mb-4" aria-label="Breadcrumb">
          <ol class="flex items-center space-x-4">
            <li>
              <a href="/projects" class="text-gray-500 hover:text-gray-700">Projects</a>
            </li>
            <li class="flex items-center">
              <svg class="flex-shrink-0 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
              </svg>
              <span class="ml-4 text-gray-700 font-medium">{data.project.name}</span>
            </li>
          </ol>
        </nav>
        
        <!-- Header -->
        <div class="md:flex md:items-center md:justify-between">
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {data.project.name}
            </h1>
            <p class="mt-1 text-sm text-gray-500">
              Project Code: {data.project.code}
            </p>
            {#if data.project.description}
              <p class="mt-2 text-sm text-gray-600">
                {data.project.description}
              </p>
            {/if}
          </div>
          <div class="mt-4 flex md:mt-0 md:ml-4">
            <button
              onclick={() => showCreateModal = true}
              class="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
        <FileText class="mx-auto h-12 w-12 text-gray-400" />
        <h3 class="mt-2 text-sm font-medium text-gray-900">No questionnaires</h3>
        <p class="mt-1 text-sm text-gray-500">Get started by creating a new questionnaire.</p>
        <div class="mt-6">
          <button
            onclick={() => showCreateModal = true}
            class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus class="-ml-1 mr-2 h-5 w-5" />
            New Questionnaire
          </button>
        </div>
      </div>
    {:else}
      <div class="bg-white shadow overflow-hidden sm:rounded-md">
        <ul class="divide-y divide-gray-200">
          {#each data.questionnaires as questionnaire}
            <li>
              <div class="px-4 py-4 sm:px-6 hover:bg-gray-50">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <FileText class="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p class="text-sm font-medium text-gray-900">
                        {questionnaire.name}
                      </p>
                      {#if questionnaire.description}
                        <p class="text-sm text-gray-500">
                          {questionnaire.description}
                        </p>
                      {/if}
                    </div>
                  </div>
                  <div class="flex items-center space-x-4">
                    <span class={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(questionnaire.status)}`}>
                      {questionnaire.status}
                    </span>
                    <div class="flex items-center space-x-2">
                      {#if questionnaire.status === 'published'}
                        <button
                          onclick={() => goto(`/projects/${data.project.id}/questionnaires/${questionnaire.id}/run`)}
                          class="text-gray-600 hover:text-gray-900"
                          title="Run questionnaire"
                        >
                          <Play class="h-5 w-5" />
                        </button>
                      {/if}
                      <button
                        onclick={() => goto(`/projects/${data.project.id}/designer/${questionnaire.id}`)}
                        class="text-gray-600 hover:text-gray-900"
                        title="Edit questionnaire"
                      >
                        <Edit class="h-5 w-5" />
                      </button>
                      <button
                        class="text-gray-600 hover:text-gray-900"
                        title="More options"
                      >
                        <MoreVertical class="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div class="mt-2 sm:flex sm:justify-between">
                  <div class="sm:flex">
                    <p class="flex items-center text-sm text-gray-500">
                      <Users class="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                      {questionnaire.response_count || 0} responses
                    </p>
                    <p class="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                      <Calendar class="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                      Updated {formatDate(questionnaire.updated_at)}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </main>
</div>

<!-- Create Questionnaire Modal -->
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
            <FileText class="h-6 w-6 text-blue-600" />
          </div>
          <div class="mt-3 text-center sm:mt-5">
            <h3 class="text-lg leading-6 font-medium text-gray-900">
              Create New Questionnaire
            </h3>
            <div class="mt-6 space-y-4">
              <div class="text-left">
                <label for="questionnaire-name" class="block text-sm font-medium text-gray-700">
                  Questionnaire Name
                </label>
                <input
                  type="text"
                  id="questionnaire-name"
                  bind:value={questionnaireName}
                  class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="My Questionnaire"
                />
              </div>
              
              <div class="text-left">
                <label for="questionnaire-description" class="block text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <textarea
                  id="questionnaire-description"
                  bind:value={questionnaireDescription}
                  rows="3"
                  class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Brief description of your questionnaire..."
                ></textarea>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
          <button
            onclick={createQuestionnaire}
            disabled={!questionnaireName.trim()}
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:col-start-2 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create & Edit
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