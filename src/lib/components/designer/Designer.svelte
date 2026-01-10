<script lang="ts">
  import { onMount } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import QuestionPalette from './QuestionPalette.svelte';
  import PageCanvas from './PageCanvas.svelte';
  import VariableManager from './VariableManager.svelte';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import SaveLoadToolbar from './SaveLoadToolbar.svelte';

  let activeTab = $state<'questions' | 'variables' | 'flow'>('questions');

  let questionnaireName = $derived(designerStore.questionnaire.name);
  let pages = $derived(designerStore.questionnaire.pages);
  let showPreview = $derived(designerStore.previewMode);

  // Initialize
  onMount(() => {
    designerStore.initVariableEngine();
  });

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'z':
          if (e.shiftKey && designerStore.canRedo) {
            e.preventDefault();
            designerStore.redo();
          } else if (designerStore.canUndo) {
            e.preventDefault();
            designerStore.undo();
          }
          break;
        case 's':
          e.preventDefault();
          handleSave();
          break;
        case 'p':
          e.preventDefault();
          designerStore.togglePreview();
          break;
      }
    }
  }

  async function handleSave() {
    await designerStore.saveQuestionnaire();
  }

  function handleExport() {
    const questionnaire = designerStore.exportQuestionnaire();
    const blob = new Blob([JSON.stringify(questionnaire, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${questionnaire.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        try {
          const questionnaire = JSON.parse(text);
          designerStore.importQuestionnaire(questionnaire);
        } catch (error) {
          alert('Invalid questionnaire file');
        }
      }
    };
    input.click();
  }

  function handleAddPage() {
    designerStore.addPage();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="h-screen flex flex-col bg-gray-100">
  <!-- Save/Load Toolbar -->
  <SaveLoadToolbar />

  <!-- Main Toolbar -->
  <div class="bg-white border-b border-gray-200 px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <h1 class="text-xl font-semibold text-gray-900">
          {questionnaireName || 'Untitled Questionnaire'}
        </h1>

        <div class="flex items-center space-x-2">
          <button
            onclick={() => designerStore.undo()}
            disabled={!designerStore.canUndo}
            class="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          </button>

          <button
            onclick={() => designerStore.redo()}
            disabled={!designerStore.canRedo}
            class="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <button
          onclick={handleImport}
          class="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          Import
        </button>

        <button
          onclick={handleExport}
          class="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          Export
        </button>

        <button
          onclick={handleSave}
          class="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Save
        </button>

        <button
          onclick={() => designerStore.togglePreview()}
          class="px-4 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar -->
    <div class="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      <!-- Tabs -->
      <div class="flex border-b border-gray-200 bg-white">
        <button
          onclick={() => (activeTab = 'questions')}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'questions'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900'}"
        >
          Questions
        </button>
        <button
          onclick={() => (activeTab = 'variables')}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'variables'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900'}"
        >
          Variables
        </button>
        <button
          onclick={() => (activeTab = 'flow')}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'flow'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900'}"
        >
          Flow
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto p-4">
        {#if activeTab === 'questions'}
          <QuestionPalette />
        {:else if activeTab === 'variables'}
          <VariableManager />
        {:else if activeTab === 'flow'}
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 class="text-lg font-semibold mb-4 text-gray-800">Page Flow</h3>

            <!-- Pages List -->
            <div class="space-y-2 mb-4">
              {#each pages as page, index}
                <button
                  onclick={() => designerStore.setCurrentPage(page.id)}
                  class="w-full text-left p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 mb-2 block transition-colors"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <h4 class="font-medium">{page.name || `Page ${index + 1}`}</h4>
                      <p class="text-xs text-gray-600">
                        {(page.questions ?? []).length} questions
                      </p>
                    </div>
                    <svg
                      class="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>
              {/each}
            </div>

            <button
              onclick={handleAddPage}
              class="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg
                     hover:border-gray-400 text-gray-600 hover:text-gray-800 transition-colors"
            >
              + Add Page
            </button>

            <div class="mt-6 p-3 bg-yellow-50 rounded-lg">
              <p class="text-sm text-yellow-800">
                <strong>Tip:</strong> Use variables in conditions to create dynamic page flow
              </p>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Canvas -->
    <PageCanvas />

    <!-- Right Sidebar (Properties) -->
    <div class="w-80 bg-gray-50 border-l border-gray-200">
      <PropertiesPanel />
    </div>
  </div>

  <!-- Status Bar -->
  <div class="bg-white border-t border-gray-200 px-4 py-2">
    <div class="flex items-center justify-between text-sm text-gray-600">
      <div class="flex items-center space-x-4">
        <span>{pages.length} page{pages.length !== 1 ? 's' : ''}</span>
        <span>•</span>
        <span>{pages.reduce((sum, p) => sum + (p.questions ?? []).length, 0)} questions</span>
        <span>•</span>
        <button onclick={() => designerStore.validate()} class="text-blue-600 hover:text-blue-800">
          Validate
        </button>
      </div>

      <div class="flex items-center space-x-2">
        <span class="text-xs">Last saved: Never</span>
      </div>
    </div>
  </div>
</div>
