<script lang="ts">
  import { 
    designerStore, 
    currentPage, 
    currentPageBlocks,
    currentBlock,
    currentBlockQuestions 
  } from '$lib/features/designer/stores/designerStore';
  import QuestionVisualRenderer from '$lib/wysiwyg/QuestionVisualRenderer.svelte';
  import QuestionRenderer from '$lib/components/questions/QuestionRenderer.svelte';
  import LiveTestRunner from '$lib/wysiwyg/LiveTestRunner.svelte';
  import { defaultTheme } from '$lib/shared';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import uiTheme from '$lib/theme';
  
  // Theme management - in real app would come from store
  let questionnaireTheme = defaultTheme;
  let showTestRunner = false;
  
  // Get variables from the store for analytics components
  $: questionnaire = $designerStore.questionnaire;
  $: variables = questionnaire.variables.reduce((acc, v) => {
    acc[v.id] = v.defaultValue;
    acc[v.name] = v.defaultValue; // Index by both ID and name
    return acc;
  }, {} as Record<string, any>);
  
  // Zoom state
  let zoomLevel = 100;
  const zoomLevels = [50, 75, 90, 100, 110, 125, 150];
  
  function zoomIn() {
    const currentIndex = zoomLevels.indexOf(zoomLevel);
    if (currentIndex < zoomLevels.length - 1) {
      zoomLevel = zoomLevels[currentIndex + 1];
    }
  }
  
  function zoomOut() {
    const currentIndex = zoomLevels.indexOf(zoomLevel);
    if (currentIndex > 0) {
      zoomLevel = zoomLevels[currentIndex - 1];
    }
  }
  
  // DnD items - show questions from current block
  $: items = $currentBlockQuestions?.map(q => ({ 
    id: q.id, 
    question: q 
  })) || [];
  
  function handleDndConsider(e: CustomEvent) {
    if (!e.detail?.items || !$currentBlock) return;
    
    const newItems = e.detail.items;
    // Update order in store
    const questionIds = newItems.map((item: any) => item.id).filter(Boolean);
    if (questionIds.length > 0) {
      designerStore.updateBlockQuestions($currentBlock.id, questionIds);
    }
  }
  
  function handleDndFinalize(e: CustomEvent) {
    if (!e.detail?.items) return;
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
        <button 
          onclick={zoomOut}
          disabled={zoomLevel === 50}
          class="px-2 py-1 text-sm {uiTheme.semantic.interactive.ghost} disabled:opacity-50"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>
        <span class="px-2 py-1 text-sm {uiTheme.semantic.textPrimary} border-x {uiTheme.semantic.borderDefault}">{zoomLevel}%</span>
        <button 
          onclick={zoomIn}
          disabled={zoomLevel === 150}
          class="px-2 py-1 text-sm {uiTheme.semantic.interactive.ghost} disabled:opacity-50"
        >
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
      onclick={() => showTestRunner = true}
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
  <div class="min-h-full p-8 overflow-auto">
    <div 
      class="mx-auto transition-transform duration-200 origin-top"
      style="transform: scale({zoomLevel / 100}); width: {100 / (zoomLevel / 100)}%; max-width: {300 * 100 / zoomLevel}%;"
    >
      <!-- Page Background -->
      <div 
        class="{uiTheme.components.container.card} min-h-[600px] max-w-3xl mx-auto"
        ondrop={handleDrop}
        ondragover={(e) => e.preventDefault()}
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
                  <span class="text-muted-foreground mr-1">›</span>
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
                <label class="text-sm text-muted-foreground">Block:</label>
                <select
                  value={$currentBlock?.id}
                  onchange={(e) => designerStore.setCurrentBlock(e.currentTarget.value)}
                  class="text-sm px-3 py-1 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  {#each $currentPageBlocks as block}
                    <option value={block.id}>
                      {block.name || 'Untitled Block'}
                      ({(block.questions ?? []).length} questions)
                    </option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>
        </div>
        
        <!-- Questions Area -->
        <div class="px-8 py-6">
          {#if items.length === 0 || !$currentBlock}
            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                <svg class="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 class="text-base font-medium text-foreground mb-1">Add your first question</h3>
              <p class="text-sm text-muted-foreground max-w-sm">
                Drag a question type from the left sidebar or click the + button to get started
              </p>
            </div>
          {:else}
            <!-- Questions List -->
            {#key $currentBlock?.id}
              <div
                class="space-y-4"
                use:dndzone={{ 
                  items: items || [],
                  flipDurationMs: 300,
                  dropTargetStyle: {
                    outline: '2px dashed #3B82F6',
                    outlineOffset: '4px',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)'
                  },
                  dropFromOthersDisabled: false,
                  dragDisabled: false,
                  type: 'questions'
                }}
                onconsider={handleDndConsider}
                onfinalize={handleDndFinalize}
              >
                {#each items as item (item.id)}
                  <div animate:flip={{ duration: 300 }}>
                    {#if item && item.question}
                      {#if item.question.type === 'bar-chart' || item.question.category === 'analytics'}
                        <!-- Use QuestionRenderer for analytics components -->
                        <div
                          class="analytics-wrapper"
                          class:selected={$designerStore.selectedItemId === item.id}
                          onclick={() => designerStore.selectItem(item.id, 'question')}
                        >
                          <QuestionRenderer
                            question={item.question}
                            mode="preview"
                            {variables}
                          />

                        </div>
                      {:else}
                        <!-- Use QuestionVisualRenderer for regular questions and instructions -->
                        <QuestionVisualRenderer
                          question={item.question}
                          theme={questionnaireTheme}
                          mode="edit"
                          selected={$designerStore.selectedItemId === item.id}
                          onselect={() => designerStore.selectItem(item.id, 'question')}
                          onupdate={(updates) => handleQuestionUpdate(item.id, updates)}
                          ondelete={() => designerStore.deleteQuestion(item.id)}
                          oneditproperties={() => {
                            designerStore.selectItem(item.id, 'question');
                          }}
                          {variables}
                        />
                      {/if}
                    {/if}
                  </div>
                {/each}
              </div>
            {/key}
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
              class:bg-muted={page.id !== $currentPage?.id}
              onclick={() => designerStore.setCurrentPage(page.id)}
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
    theme={questionnaireTheme}
    startPageId={$currentPage?.id}
    showDebugInfo={true}
    onclose={() => showTestRunner = false}
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
  
  .analytics-wrapper {
    position: relative;
    border-radius: 0.5rem;
    transition: all 0.2s ease;
  }
  
  .analytics-wrapper.selected {
    outline: 2px solid #3B82F6;
    outline-offset: 2px;
  }
  
  .analytics-wrapper .edit-controls {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.5rem;
  }
  
  .analytics-wrapper .edit-controls button {
    padding: 0.25rem 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  
  .analytics-wrapper .edit-controls button:hover {
    background: #f3f4f6;
  }
</style>