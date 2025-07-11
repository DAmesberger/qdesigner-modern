<script lang="ts">
  import { designerStore, currentPage, currentPageQuestions } from '$lib/stores/designerStore';
  import QuestionCard from './QuestionCard.svelte';
  import type { Question } from '$lib/shared';

  let isDragOver = false;
  let selectedItemId: string | null = null;

  // Subscribe to store
  $: page = $currentPage;
  $: questions = $currentPageQuestions;
  designerStore.subscribe(state => {
    selectedItemId = state.selectedItemId;
  });

  function handleDragOver(e: DragEvent) {
    if (!page || questions.length > 0) return;
    
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e: DragEvent) {
    if (!page) return;
    
    e.preventDefault();
    isDragOver = false;
    
    try {
      const data = JSON.parse(e.dataTransfer!.getData('application/json'));
      
      if (data.type === 'new-question' && questions.length === 0) {
        designerStore.addQuestion(page.id, data.questionType);
      }
    } catch (error) {
      console.error('Failed to handle drop:', error);
    }
  }

  function handleCanvasClick() {
    designerStore.selectItem(null, null);
  }

  function handlePageClick(e: MouseEvent) {
    e.stopPropagation();
    if (page) {
      designerStore.selectItem(page.id, 'page');
    }
  }
</script>

<div class="flex-1 bg-gray-50 overflow-auto" on:click={handleCanvasClick}>
  <div class="min-h-full p-8">
    {#if page}
      <div class="max-w-4xl mx-auto">
        <!-- Page Header -->
        <div
          on:click={handlePageClick}
          class="mb-6 p-4 bg-white rounded-lg shadow-sm border-2 cursor-pointer
                 {selectedItemId === page.id ? 'border-blue-500' : 'border-gray-200'}"
        >
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-semibold text-gray-900">{page.name || 'Untitled Page'}</h2>
              <p class="text-sm text-gray-600 mt-1">
                Page ID: {page.id} • {questions.length} question{questions.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div class="flex items-center space-x-2">
              {#if page.conditions && page.conditions.length > 0}
                <span class="px-2 py-1 bg-yellow-100 rounded-md text-yellow-700 text-xs">
                  Conditional
                </span>
              {/if}
              
              <button
                on:click|stopPropagation={() => {/* open page settings */}}
                class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Page Settings"
              >
                <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Questions -->
        {#if questions.length > 0}
          <div class="space-y-4">
            {#each questions as question, index (question.id)}
              <QuestionCard
                {question}
                {index}
                isSelected={selectedItemId === question.id}
              />
            {/each}
          </div>

          <!-- Drop zone at end -->
          <div
            on:dragover={(e) => {
              e.preventDefault();
              e.dataTransfer!.dropEffect = 'copy';
            }}
            on:drop={(e) => {
              e.preventDefault();
              try {
                const data = JSON.parse(e.dataTransfer!.getData('application/json'));
                if (data.type === 'new-question') {
                  designerStore.addQuestion(page.id, data.questionType);
                }
              } catch (error) {
                console.error('Failed to handle drop:', error);
              }
            }}
            class="mt-4 p-8 border-2 border-dashed border-gray-300 rounded-lg
                   hover:border-gray-400 transition-colors text-center"
          >
            <p class="text-sm text-gray-500">Drop a question here to add it to the end</p>
          </div>
        {:else}
          <!-- Empty state -->
          <div
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:drop={handleDrop}
            class="h-96 flex items-center justify-center border-2 border-dashed rounded-lg
                   transition-colors {isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}"
          >
            <div class="text-center">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M8 14v20c0 4.418 7.163 8 16 8 1.381 0 2.721-.087 4-.252M8 14c0 4.418 7.163 8 16 8s16-3.582 16-8M8 14c0-4.418 7.163-8 16-8s16 3.582 16 8m0 0v14m0-4c0 4.418-7.163 8-16 8S8 28.418 8 24" />
              </svg>
              <h3 class="mt-2 text-sm font-medium text-gray-900">No questions</h3>
              <p class="mt-1 text-sm text-gray-500">Drag a question type here to get started</p>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="h-full flex items-center justify-center">
        <div class="text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 48 48">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M9 12h6m-6 8h6m-6 8h6m3-24h22a2 2 0 012 2v20a2 2 0 01-2 2H18a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No page selected</h3>
          <p class="mt-1 text-sm text-gray-500">Create or select a page to start designing</p>
        </div>
      </div>
    {/if}
  </div>
</div>