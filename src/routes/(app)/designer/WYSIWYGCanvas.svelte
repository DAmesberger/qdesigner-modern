<script lang="ts">
  import { 
    designerStore, 
    currentPage, 
    currentPageBlocks,
    currentBlock,
    currentBlockQuestions 
  } from '$lib/stores/designerStore';
  import QuestionVisualRenderer from '$lib/wysiwyg/QuestionVisualRenderer.svelte';
  import LiveTestRunner from '$lib/wysiwyg/LiveTestRunner.svelte';
  import { defaultTheme } from '$lib/shared';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import uiTheme from '$lib/theme';
  
  // Theme management - in real app would come from store
  let questionnaireTheme = defaultTheme;
  let showTestRunner = false;
  
  // DnD items - show questions from current block
  $: items = $currentBlockQuestions.map(q => ({ 
    id: q.id, 
    question: q 
  }));
  
  function handleDndConsider(e: CustomEvent) {
    const newItems = e.detail.items;
    // Update order in store
    const questionIds = newItems.map((item: any) => item.id);
    if ($currentBlock) {
      designerStore.updateBlockQuestions($currentBlock.id, questionIds);
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
    if (data && $currentBlock) {
      const parsedData = JSON.parse(data);
      if (parsedData.type === 'new-question' && parsedData.questionType) {
        designerStore.addQuestion($currentBlock.id, parsedData.questionType);
      }
    }
  }
</script>

<div class="h-full overflow-auto {uiTheme.components.designerCanvas.base}">
  <!-- Canvas Controls -->
  <div class="sticky top-0 z-10 {uiTheme.semantic.bgBase} {uiTheme.semantic.borderDefault} border-b px-4 py-2 flex items-center justify-between backdrop-blur-sm bg-opacity-95">
    <div class="flex items-center gap-2">
      <!-- Zoom Controls -->
      <div class="flex items-center {uiTheme.semantic.bgSurface} rounded-md {uiTheme.semantic.borderDefault} border">
        <button class="px-2 py-1 text-sm {uiTheme.semantic.interactive.ghost}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>
        <span class="px-2 py-1 text-sm {uiTheme.semantic.textPrimary} border-x {uiTheme.semantic.borderDefault}">100%</span>
        <button class="px-2 py-1 text-sm {uiTheme.semantic.interactive.ghost}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
          </svg>
        </button>
      </div>
      
      <!-- Grid Toggle -->
      <button class="p-1.5 {uiTheme.semantic.textSecondary} {uiTheme.semantic.interactive.ghost} rounded-md">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>
    </div>
    
    <button
      on:click={() => showTestRunner = true}
      class="flex items-center gap-1.5 px-3 py-1.5 {uiTheme.components.button.variants.outline} {uiTheme.components.button.sizes.sm} rounded-md"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Test
    </button>
  </div>
  
  <!-- Canvas Area -->
  <div class="min-h-full p-8">
    <div class="max-w-3xl mx-auto">
      <!-- Page Background -->
      <div 
        class="{uiTheme.components.container.card} min-h-[600px]"
        on:drop={handleDrop}
        on:dragover={(e) => e.preventDefault()}
      >
        <!-- Page Header -->
        <div class="px-8 pt-8 pb-4 border-b {uiTheme.semantic.borderDefault}">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="{uiTheme.typography.h3} {uiTheme.semantic.textPrimary}">
                {$currentPage?.name || 'Page 1'}
              </h2>
              {#if $currentBlock}
                <p class="{uiTheme.typography.bodySmall} {uiTheme.semantic.textSecondary} mt-1 flex items-center">
                  <span class="text-gray-400 mr-1">›</span>
                  {$currentBlock.name || 'Untitled Block'}
                  {#if $currentBlock.type !== 'standard'}
                    <span class="ml-2 {uiTheme.components.badge.default} {uiTheme.components.badge.outline}">
                      {$currentBlock.type}
                    </span>
                  {/if}
                </p>
              {/if}
            </div>
            
            <!-- Block selector -->
            {#if $currentPageBlocks.length > 1}
              <div class="flex items-center space-x-2">
                <label class="text-sm text-gray-600">Block:</label>
                <select
                  value={$currentBlock?.id}
                  on:change={(e) => designerStore.setCurrentBlock(e.currentTarget.value)}
                  class="text-sm px-3 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {#each $currentPageBlocks as block}
                    <option value={block.id}>
                      {block.name || 'Untitled Block'}
                      ({block.questions.length} questions)
                    </option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>
        </div>
        
        <!-- Questions Area -->
        <div class="px-8 py-6">
          {#if items.length === 0}
            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 class="text-base font-medium text-gray-900 mb-1">Add your first question</h3>
              <p class="text-sm text-gray-500 max-w-sm">
                Drag a question type from the left sidebar or click the + button to get started
              </p>
            </div>
          {:else}
            <!-- Questions List -->
            <div
              class="space-y-4"
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
            >
              {#each items as item (item.id)}
                <div animate:flip={{ duration: 300 }}>
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
      
      <!-- Page Navigation -->
      {#if $designerStore.questionnaire.pages.length > 1}
        <div class="mt-6 flex items-center justify-center gap-2">
          {#each $designerStore.questionnaire.pages as page, index}
            <button
              class="w-2 h-2 rounded-full transition-colors"
              class:bg-blue-600={page.id === $currentPage?.id}
              class:bg-gray-300={page.id !== $currentPage?.id}
              on:click={() => designerStore.setCurrentPage(page.id)}
              title="Page {index + 1}"
            />
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