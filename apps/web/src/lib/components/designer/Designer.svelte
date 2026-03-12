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

<div class="h-screen flex flex-col bg-muted">
  <!-- Save/Load Toolbar -->
  <SaveLoadToolbar />

  <!-- Main Toolbar -->
  <div class="bg-card border-b border-border px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <h1 class="text-xl font-semibold text-foreground">
          {questionnaireName || 'Untitled Questionnaire'}
        </h1>

        <div class="flex items-center space-x-2">
          <button
            onclick={() => designerStore.undo()}
            disabled={!designerStore.canUndo}
            class="p-2 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
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
            class="p-2 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
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
          class="px-3 py-1.5 text-muted-foreground hover:bg-accent rounded-md transition-colors"
        >
          Import
        </button>

        <button
          onclick={handleExport}
          class="px-3 py-1.5 text-muted-foreground hover:bg-accent rounded-md transition-colors"
        >
          Export
        </button>

        <button
          onclick={handleSave}
          class="px-4 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Save
        </button>

        <button
          onclick={() => designerStore.togglePreview()}
          class="px-4 py-1.5 bg-success text-white rounded-md hover:bg-success/90 transition-colors"
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar -->
    <div class="w-80 bg-muted border-r border-border flex flex-col">
      <!-- Tabs -->
      <div class="flex border-b border-border bg-card">
        <button
          onclick={() => (activeTab = 'questions')}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'questions'
            ? 'text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'}"
        >
          Questions
        </button>
        <button
          onclick={() => (activeTab = 'variables')}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'variables'
            ? 'text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'}"
        >
          Variables
        </button>
        <button
          onclick={() => (activeTab = 'flow')}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'flow'
            ? 'text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'}"
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
          <div class="bg-card rounded-lg shadow-sm border border-border p-4">
            <h3 class="text-lg font-semibold mb-4 text-foreground">Page Flow</h3>

            <!-- Pages List -->
            <div class="space-y-2 mb-4">
              {#each pages as page, index}
                <button
                  onclick={() => designerStore.setCurrentPage(page.id)}
                  class="w-full text-left p-3 bg-muted rounded-lg cursor-pointer hover:bg-accent mb-2 block transition-colors"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <h4 class="font-medium">{page.name || `Page ${index + 1}`}</h4>
                      <p class="text-xs text-muted-foreground">
                        {(page.questions ?? []).length} questions
                      </p>
                    </div>
                    <svg
                      class="w-4 h-4 text-muted-foreground"
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
              class="w-full px-3 py-2 border-2 border-dashed border-border rounded-lg
                     hover:border-muted-foreground text-muted-foreground hover:text-foreground transition-colors"
            >
              + Add Page
            </button>

            <div class="mt-6 p-3 bg-warning/10 rounded-lg">
              <p class="text-sm text-warning">
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
    <div class="w-80 bg-muted border-l border-border">
      <PropertiesPanel />
    </div>
  </div>

  <!-- Status Bar -->
  <div class="bg-card border-t border-border px-4 py-2">
    <div class="flex items-center justify-between text-sm text-muted-foreground">
      <div class="flex items-center space-x-4">
        <span>{pages.length} page{pages.length !== 1 ? 's' : ''}</span>
        <span>•</span>
        <span>{pages.reduce((sum, p) => sum + (p.questions ?? []).length, 0)} questions</span>
        <span>•</span>
        <button onclick={() => designerStore.validate()} class="text-primary hover:text-primary/80">
          Validate
        </button>
      </div>

      <div class="flex items-center space-x-2">
        <span class="text-xs">Last saved: Never</span>
      </div>
    </div>
  </div>
</div>
