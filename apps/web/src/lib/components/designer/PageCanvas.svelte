<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import type { Question } from '$lib/shared';
  import { Settings, Database, FileText } from 'lucide-svelte';

  let isDragOver = $state(false);

  let page = $derived(designerStore.currentPage);
  let questions = $derived(designerStore.currentPageQuestions);
  // Using optional chaining safely
  let selectedItemId = $derived(designerStore.selectedItem ? designerStore.selectedItem.id : null);

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
      console.error('Failed to handle drop:', error as Error);
    }
  }

  function handleCanvasClick() {
    designerStore.selectItem(null);
  }

  function handlePageClick(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    if (page) {
      designerStore.selectItem(page.id, 'page');
    }
  }

  function quickAddQuestion(type: string) {
    if (!page) return;
    designerStore.addQuestion(page.id, type);
  }
</script>

<div
  role="button"
  tabindex="0"
  class="flex-1 bg-muted overflow-auto"
  onclick={handleCanvasClick}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCanvasClick()}
>
  <div class="min-h-full p-8">
    {#if page}
      <div class="max-w-4xl mx-auto">
        <!-- Page Header -->
        <div
          role="button"
          tabindex="0"
          onclick={handlePageClick}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handlePageClick(e)}
          class="mb-6 p-4 bg-card rounded-lg shadow-sm border-2 cursor-pointer
                 {selectedItemId === page.id ? 'border-primary' : 'border-border'}"
        >
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-semibold text-foreground">{page.name || 'Untitled Page'}</h2>
              <p class="text-sm text-muted-foreground mt-1">
                Page ID: {page.id} • {questions.length} question{questions.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div class="flex items-center space-x-2">
              {#if page.conditions && page.conditions.length > 0}
                <span class="px-2 py-1 bg-warning/10 rounded-md text-warning text-xs">
                  Conditional
                </span>
              {/if}

              <div class="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                  onclick={(e) => {
                    e.stopPropagation();
                    quickAddQuestion('multiple-choice');
                  }}
                  data-testid="designer-quick-add-choice"
                >
                  + Choice
                </button>
                <button
                  type="button"
                  class="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                  onclick={(e) => {
                    e.stopPropagation();
                    quickAddQuestion('text-input');
                  }}
                  data-testid="designer-quick-add-text"
                >
                  + Text
                </button>
                <button
                  type="button"
                  class="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                  onclick={(e) => {
                    e.stopPropagation();
                    quickAddQuestion('reaction-experiment');
                  }}
                  data-testid="designer-quick-add-reaction"
                >
                  + Reaction
                </button>
              </div>

              <button
                onclick={(e) => {
                  e.stopPropagation();
                  /* open page settings */
                }}
                class="p-2 hover:bg-accent rounded-lg transition-colors"
                title="Page Settings"
                aria-label="Page Settings"
              >
                <Settings size={20} class="text-muted-foreground" />
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
                pageId={page.id}
              />
            {/each}
          </div>

          <!-- Drop zone at end -->
          <div
            role="region"
            aria-label="Drop zone for new questions"
            ondragover={(e) => {
              e.preventDefault();
              e.dataTransfer!.dropEffect = 'copy';
            }}
            ondrop={(e) => {
              e.preventDefault();
              try {
                const data = JSON.parse(e.dataTransfer!.getData('application/json'));
                if (data.type === 'new-question') {
                  designerStore.addQuestion(page.id, data.questionType);
                }
              } catch (error) {
                console.error('Failed to handle drop:', error as Error);
              }
            }}
            class="mt-4 p-8 border-2 border-dashed border-border rounded-lg
                   hover:border-muted-foreground transition-colors text-center"
          >
            <p class="text-sm text-muted-foreground">Drop a question here to add it to the end</p>
          </div>
        {:else}
          <!-- Empty state -->
          <div
            role="region"
            aria-label="Empty page drop zone"
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            class="h-96 flex items-center justify-center border-2 border-dashed rounded-lg
                   transition-colors {isDragOver
              ? 'border-primary bg-primary/10'
              : 'border-border'}"
          >
            <div class="text-center">
              <Database size={48} class="mx-auto text-muted-foreground" />
              <h3 class="mt-2 text-sm font-medium text-foreground">No questions</h3>
              <p class="mt-1 text-sm text-muted-foreground">Drag a question type here to get started</p>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="h-full flex items-center justify-center">
        <div class="text-center">
          <FileText size={48} class="mx-auto text-muted-foreground" />
          <h3 class="mt-2 text-sm font-medium text-foreground">No page selected</h3>
          <p class="mt-1 text-sm text-muted-foreground">Create or select a page to start designing</p>
        </div>
      </div>
    {/if}
  </div>
</div>
