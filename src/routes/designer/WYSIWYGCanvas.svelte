<script lang="ts">
  import { 
    designerStore, 
    currentPage, 
    currentPageQuestions 
  } from '$lib/stores/designerStore';
  import QuestionVisualRenderer from '$lib/wysiwyg/QuestionVisualRenderer.svelte';
  import LiveTestRunner from '$lib/wysiwyg/LiveTestRunner.svelte';
  import { defaultTheme } from '$lib/shared';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  
  // Theme management - in real app would come from store
  let theme = defaultTheme;
  let showTestRunner = false;
  
  // DnD items
  $: items = $currentPageQuestions.map(q => ({ 
    id: q.id, 
    question: q 
  }));
  
  function handleDndConsider(e: CustomEvent) {
    const newItems = e.detail.items;
    // Update order in store
    const questionIds = newItems.map((item: any) => item.id);
    if ($currentPage) {
      designerStore.updatePageQuestions($currentPage.id, questionIds);
    }
  }
  
  function handleDndFinalize(e: CustomEvent) {
    handleDndConsider(e);
  }
  
  function handleQuestionUpdate(questionId: string, updates: any) {
    designerStore.updateQuestion(questionId, updates);
  }
  
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const data = e.dataTransfer?.getData('application/json');
    if (data) {
      const { type } = JSON.parse(data);
      designerStore.addQuestion({
        type,
        text: `New ${type} question`,
        name: `question_${Date.now()}`,
        required: false,
        settings: {}
      });
    }
  }
</script>

<div class="h-full bg-gray-50 overflow-auto">
  <div class="max-w-4xl mx-auto p-8">
    <!-- Page Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold text-gray-900">
          {$currentPage?.name || 'Page'}
        </h2>
        <p class="text-sm text-gray-600 mt-1">
          Visual preview of how your questionnaire will appear to participants
        </p>
      </div>
      
      <button
        on:click={() => showTestRunner = true}
        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Test Page
      </button>
    </div>
    
    <!-- Page Canvas -->
    <div 
      class="page-canvas"
      style={Object.entries(theme.components.page)
        .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
        .join('; ')}
      on:drop={handleDrop}
      on:dragover={(e) => e.preventDefault()}
    >
      {#if items.length === 0}
        <div class="empty-state">
          <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No questions yet</h3>
          <p class="text-gray-600">Drag a question type from the sidebar to get started</p>
        </div>
      {:else}
        <div
          class="questions-container"
          use:dndzone={{ 
            items,
            flipDurationMs: 300,
            dropTargetStyle: {
              outline: '2px dashed #3B82F6',
              outlineOffset: '4px',
              backgroundColor: 'rgba(59, 130, 246, 0.05)'
            }
          }}
          on:consider={handleDndConsider}
          on:finalize={handleDndFinalize}
          style="display: flex; flex-direction: column; gap: {theme.global.spacing[6]}"
        >
          {#each items as item (item.id)}
            <div 
              animate:flip={{ duration: 300 }}
              class="question-wrapper"
            >
              <QuestionVisualRenderer
                question={item.question}
                {theme}
                mode="edit"
                selected={$designerStore.selectedItemId === item.id}
                on:select={() => designerStore.selectItem(item.id, 'question')}
                on:update={(e) => handleQuestionUpdate(item.id, e.detail)}
                on:delete={() => designerStore.deleteQuestion(item.id)}
                on:edit-properties={() => {
                  designerStore.selectItem(item.id, 'question');
                }}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Test Runner -->
{#if showTestRunner}
  <LiveTestRunner
    questionnaire={$designerStore.questionnaire}
    {theme}
    startPageId={$currentPage?.id}
    showDebugInfo={true}
    on:close={() => showTestRunner = false}
    on:response={(e) => console.log('Test response:', e.detail)}
    on:complete={(e) => console.log('Test complete:', e.detail)}
  />
{/if}

<style>
  .page-canvas {
    min-height: 600px;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    padding: 2rem;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
  }
  
  .question-wrapper {
    position: relative;
  }
  
  :global(.questions-container > div) {
    transition: transform 0.2s ease;
  }
  
  :global(.questions-container > div:hover) {
    transform: translateY(-1px);
  }
</style>