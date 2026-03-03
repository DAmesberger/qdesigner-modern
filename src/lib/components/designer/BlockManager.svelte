<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { Block, Question, ExperimentalCondition } from '$lib/shared';
  import {
    ChevronRight, ChevronDown, Plus,
    FileText, Shuffle, GitFork, Repeat,
    Pencil, Trash2,
    // Question type icons
    Type, CheckSquare, Star, Grid3x3, ListOrdered,
    Calendar, Paperclip, Pen, Zap, Gamepad2,
    Info, Image, BarChart3, CircleDot, Hash,
    Monitor, FilePlus2,
  } from 'lucide-svelte';

  // Collapsible state - auto-expand current page/block
  let expandedPages = $state<Record<string, boolean>>({});
  let expandedBlocks = $state<Record<string, boolean>>({});

  $effect(() => {
    const pid = designerStore.currentPageId;
    if (pid) expandedPages[pid] = true;
    const bid = designerStore.currentBlockId;
    if (bid) expandedBlocks[bid] = true;
  });

  // Modal state
  let showAddBlock = $state(false);
  let addBlockPageId = $state<string | null>(null);
  let editingBlock = $state<Block | null>(null);

  const blockTypes = [
    { type: 'standard' as const, name: 'Standard Block', description: 'Questions appear in order' },
    { type: 'randomized' as const, name: 'Randomized Block', description: 'Questions appear in random order' },
    { type: 'conditional' as const, name: 'Conditional Block', description: 'Block shown based on conditions' },
    { type: 'loop' as const, name: 'Loop Block', description: 'Repeat questions multiple times' },
  ];

  let newBlock = $state({
    name: '',
    type: 'standard' as Block['type'],
    condition: '' as string,
    conditions: [] as any[],
    randomization: { enabled: false, preserveLast: 0 } as any,
    loop: { iterations: 1, iterationVariable: '', exitCondition: '' } as any,
  });

  let experimentalConditions = $derived(
    designerStore.questionnaire.settings.experimentalDesign?.conditions ?? []
  );

  function togglePage(pageId: string) {
    expandedPages[pageId] = !expandedPages[pageId];
  }

  function toggleBlock(blockId: string) {
    expandedBlocks[blockId] = !expandedBlocks[blockId];
  }

  function getQuestionsForBlock(block: Block): Question[] {
    const ids = block.questions ?? [];
    return ids
      .map(id => designerStore.questionnaire.questions.find(q => q.id === id))
      .filter(Boolean) as Question[];
  }

  function getQuestionLabel(q: Question): string {
    return (q.display as any)?.prompt || q.name || q.id;
  }

  function truncate(text: string, max = 32): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
  }

  function handlePageClick(pageId: string) {
    designerStore.setCurrentPage(pageId);
    expandedPages[pageId] = true;
  }

  function handleBlockClick(blockId: string) {
    designerStore.selectItem(blockId, 'block');
    designerStore.setCurrentBlock(blockId);
    expandedBlocks[blockId] = true;
  }

  function handleQuestionClick(questionId: string) {
    designerStore.selectItem(questionId, 'question');
  }

  function openAddBlock(pageId: string) {
    addBlockPageId = pageId;
    showAddBlock = true;
  }

  function handleAddBlock() {
    const targetPageId = addBlockPageId || designerStore.currentPageId;
    if (!newBlock.name || !targetPageId) return;

    designerStore.addBlock(targetPageId, newBlock.type);

    const page = designerStore.questionnaire.pages.find(p => p.id === targetPageId);
    if (page && page.blocks && page.blocks.length > 0) {
      const latestBlock = page.blocks[page.blocks.length - 1];
      if (latestBlock) {
        designerStore.updateBlock(latestBlock.id, {
          name: newBlock.name,
          condition: newBlock.condition || undefined,
          randomization: newBlock.type === 'randomized' ? { ...newBlock.randomization } : undefined,
          loop: newBlock.type === 'loop' ? { ...newBlock.loop } : undefined,
        });
      }
    }

    newBlock = {
      name: '',
      type: 'standard',
      condition: '',
      conditions: [],
      randomization: { enabled: false, preserveLast: 0 } as any,
      loop: { iterations: 1, iterationVariable: '', exitCondition: '' },
    };
    showAddBlock = false;
    addBlockPageId = null;
  }

  function handleEditBlock(block: Block) {
    editingBlock = { ...block };
  }

  function handleUpdateBlock() {
    if (!editingBlock) return;
    designerStore.updateBlock(editingBlock.id, {
      name: editingBlock.name,
      type: editingBlock.type,
      condition: editingBlock.condition || undefined,
      conditions: editingBlock.conditions,
      randomization: editingBlock.randomization,
      loop: editingBlock.loop as any,
    });
    editingBlock = null;
  }

  function handleDeleteBlock(blockId: string) {
    if (confirm('Delete this block? All questions in this block will be deleted.')) {
      designerStore.deleteBlock(blockId);
    }
  }

  function handleAddPage() {
    designerStore.addPage();
  }
</script>

<!-- Structure Tree -->
<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="p-3 border-b border-border flex items-center justify-between">
    <h3 class="text-sm font-semibold text-foreground">Structure</h3>
    <button
      onclick={handleAddPage}
      class="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
      title="Add page"
    >
      <FilePlus2 class="w-3.5 h-3.5" /> Page
    </button>
  </div>

  <!-- Tree -->
  <div class="flex-1 overflow-y-auto p-2">
    {#each designerStore.questionnaire.pages as page, pageIndex (page.id)}
      {@const isCurrentPage = page.id === designerStore.currentPage?.id}
      {@const isPageExpanded = expandedPages[page.id] ?? false}
      {@const blocks = page.blocks ?? []}

      <!-- Page Node -->
      <div class="mb-1">
        <div
          class="flex items-center group rounded-md transition-colors duration-100
                 {isCurrentPage ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'}"
        >
          <button
            onclick={() => togglePage(page.id)}
            class="p-1 shrink-0"
            aria-label={isPageExpanded ? 'Collapse page' : 'Expand page'}
          >
            {#if isPageExpanded}
              <ChevronDown class="w-3.5 h-3.5" />
            {:else}
              <ChevronRight class="w-3.5 h-3.5" />
            {/if}
          </button>

          <button
            onclick={() => handlePageClick(page.id)}
            class="flex-1 text-left text-sm font-medium py-1 pr-2 truncate"
          >
            {page.name || `Page ${pageIndex + 1}`}
          </button>

          <span class="text-[10px] text-muted-foreground mr-1 shrink-0">
            {blocks.length}b
          </span>

          <button
            onclick={(e) => { e.stopPropagation(); openAddBlock(page.id); }}
            class="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
            title="Add block to this page"
            aria-label="Add block"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Blocks under page -->
        {#if isPageExpanded}
          <div class="ml-3 border-l border-border/50">
            {#if blocks.length === 0}
              <div class="ml-3 py-2 text-xs text-muted-foreground/60 italic">
                No blocks
              </div>
            {:else}
              {#each blocks as block (block.id)}
                {@const isCurrentBlock = block.id === designerStore.currentBlock?.id}
                {@const isBlockExpanded = expandedBlocks[block.id] ?? false}
                {@const questions = getQuestionsForBlock(block)}

                <!-- Block Node -->
                <div class="ml-1">
                  <div
                    class="flex items-center group rounded-md transition-colors duration-100 mt-0.5
                           {isCurrentBlock ? 'bg-primary/8 text-primary' : 'hover:bg-muted/70 text-foreground'}"
                  >
                    <button
                      onclick={() => toggleBlock(block.id)}
                      class="p-1 shrink-0"
                      aria-label={isBlockExpanded ? 'Collapse block' : 'Expand block'}
                    >
                      {#if isBlockExpanded}
                        <ChevronDown class="w-3 h-3" />
                      {:else}
                        <ChevronRight class="w-3 h-3" />
                      {/if}
                    </button>

                    <button
                      onclick={() => handleBlockClick(block.id)}
                      class="flex items-center gap-1.5 flex-1 text-left py-1 pr-1 min-w-0"
                    >
                      <span class="shrink-0 text-muted-foreground">
                        {#if block.type === 'standard'}<FileText class="w-3.5 h-3.5" />
                        {:else if block.type === 'randomized'}<Shuffle class="w-3.5 h-3.5" />
                        {:else if block.type === 'conditional'}<GitFork class="w-3.5 h-3.5" />
                        {:else if block.type === 'loop'}<Repeat class="w-3.5 h-3.5" />
                        {:else}<FileText class="w-3.5 h-3.5" />
                        {/if}
                      </span>
                      <span class="text-xs truncate">{block.name || 'Untitled Block'}</span>
                      {#if block.condition}
                        <span class="text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary shrink-0" title="Condition: {block.condition}">
                          {block.condition}
                        </span>
                      {/if}
                      <span class="text-[10px] text-muted-foreground shrink-0">({questions.length})</span>
                    </button>

                    <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onclick={(e) => { e.stopPropagation(); handleEditBlock(block); }}
                        class="p-0.5 rounded hover:bg-accent"
                        title="Edit block"
                        aria-label="Edit block"
                      >
                        <Pencil class="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button
                        onclick={(e) => { e.stopPropagation(); handleDeleteBlock(block.id); }}
                        class="p-0.5 rounded hover:bg-destructive/10"
                        title="Delete block"
                        aria-label="Delete block"
                      >
                        <Trash2 class="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  </div>

                  <!-- Questions under block -->
                  {#if isBlockExpanded}
                    <div class="ml-3 border-l border-border/40">
                      {#if questions.length === 0}
                        <div class="ml-3 py-1.5 text-[10px] text-muted-foreground/50 italic">
                          No questions
                        </div>
                      {:else}
                        {#each questions as question (question.id)}
                          {@const isSelected = designerStore.selectedItem?.id === question.id && designerStore.selectedItemType === 'question'}
                          <button
                            onclick={() => handleQuestionClick(question.id)}
                            class="flex items-center gap-1.5 w-full text-left ml-1 py-1 px-1.5 rounded transition-colors duration-100 mt-px
                                   {isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground'}"
                          >
                            <span class="shrink-0 text-muted-foreground">
                              {#if question.type === 'text-input' || question.type === 'number-input'}<Type class="w-3 h-3" />
                              {:else if question.type === 'multiple-choice'}<CheckSquare class="w-3 h-3" />
                              {:else if question.type === 'single-choice'}<CircleDot class="w-3 h-3" />
                              {:else if question.type === 'scale' || question.type === 'rating'}<Star class="w-3 h-3" />
                              {:else if question.type === 'matrix'}<Grid3x3 class="w-3 h-3" />
                              {:else if question.type === 'ranking'}<ListOrdered class="w-3 h-3" />
                              {:else if question.type === 'date-time'}<Calendar class="w-3 h-3" />
                              {:else if question.type === 'file-upload' || question.type === 'media-response'}<Paperclip class="w-3 h-3" />
                              {:else if question.type === 'drawing'}<Pen class="w-3 h-3" />
                              {:else if question.type === 'reaction-time'}<Zap class="w-3 h-3" />
                              {:else if question.type === 'webgl'}<Gamepad2 class="w-3 h-3" />
                              {:else if question.type === 'text-display'}<Monitor class="w-3 h-3" />
                              {:else if question.type === 'instruction'}<Info class="w-3 h-3" />
                              {:else if question.type === 'media-display'}<Image class="w-3 h-3" />
                              {:else if question.type === 'statistical-feedback' || question.type === 'bar-chart'}<BarChart3 class="w-3 h-3" />
                              {:else}<FileText class="w-3 h-3" />
                              {/if}
                            </span>
                            <span class="text-[11px] truncate">
                              {truncate(getQuestionLabel(question))}
                            </span>
                          </button>
                        {/each}
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if designerStore.questionnaire.pages.length === 0}
      <p class="text-xs text-muted-foreground text-center py-6">
        No pages. Click "+ Page" to get started.
      </p>
    {/if}
  </div>
</div>

<!-- Add/Edit Block Modal -->
{#if showAddBlock || editingBlock}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-layer-modal rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto border border-border"
      onclick={(e) => e.stopPropagation()}
    >
      <h3 class="text-lg font-semibold mb-4">
        {editingBlock ? 'Edit Block' : 'Add Block'}
      </h3>

      <div class="space-y-4">
        <div>
          <label for="block-name" class="block text-sm font-medium text-foreground mb-1">Name</label>
          <input
            id="block-name"
            type="text"
            value={editingBlock ? editingBlock.name : newBlock.name}
            oninput={(e) => {
              const value = e.currentTarget.value;
              if (editingBlock) {
                editingBlock.name = value;
              } else {
                newBlock.name = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="e.g., Demographics, Pre-test Questions"
          />
        </div>

        <div>
          <span id="block-type-label" class="block text-sm font-medium text-foreground mb-1">Type</span>
          <div role="group" aria-labelledby="block-type-label" class="grid grid-cols-2 gap-2">
            {#each blockTypes as blockType}
              <button
                onclick={() => {
                  if (editingBlock) {
                    editingBlock.type = blockType.type;
                  } else {
                    newBlock.type = blockType.type;
                  }
                }}
                class="p-3 border rounded-lg text-left transition-all
                       {(editingBlock ? editingBlock.type : newBlock.type) === blockType.type
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-border/80'}"
              >
                <div class="flex items-start space-x-2">
                  <span class="text-muted-foreground">
                    {#if blockType.type === 'standard'}<FileText class="w-5 h-5" />
                    {:else if blockType.type === 'randomized'}<Shuffle class="w-5 h-5" />
                    {:else if blockType.type === 'conditional'}<GitFork class="w-5 h-5" />
                    {:else if blockType.type === 'loop'}<Repeat class="w-5 h-5" />
                    {/if}
                  </span>
                  <div>
                    <h4 class="font-medium text-sm">{blockType.name}</h4>
                    <p class="text-xs text-muted-foreground mt-0.5">{blockType.description}</p>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>

        {#if experimentalConditions.length > 0}
          <div>
            <label for="block-condition" class="block text-sm font-medium text-foreground mb-1">
              Experimental Condition
            </label>
            <select
              id="block-condition"
              value={editingBlock ? (editingBlock.condition || '') : newBlock.condition}
              onchange={(e) => {
                const value = e.currentTarget.value;
                if (editingBlock) {
                  editingBlock.condition = value || undefined;
                } else {
                  newBlock.condition = value;
                }
              }}
              class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">None (always shown)</option>
              {#each experimentalConditions as cond}
                <option value={cond.name}>{cond.name}</option>
              {/each}
            </select>
            <p class="text-xs text-muted-foreground mt-1">
              Assign this block to a condition. Only participants in the selected condition will see it.
            </p>
          </div>
        {/if}

        {#if (editingBlock ? editingBlock.type : newBlock.type) === 'randomized'}
          <div class="border-t border-border pt-4">
            <h4 class="text-sm font-medium text-foreground mb-2">Randomization Settings</h4>
            <div class="space-y-3">
              <div>
                <label for="preserve-first" class="block text-sm text-muted-foreground mb-1">Preserve First N Questions</label>
                <input
                  id="preserve-first"
                  type="number"
                  min="0"
                  value={editingBlock
                    ? (editingBlock.randomization as any)?.preserveFirst || 0
                    : (newBlock.randomization as any).preserveFirst}
                  oninput={(e) => {
                    const value = parseInt(e.currentTarget.value) || 0;
                    if (editingBlock) {
                      if (!editingBlock.randomization) editingBlock.randomization = { enabled: true } as any;
                      (editingBlock.randomization as any).preserveFirst = value;
                    } else {
                      (newBlock.randomization as any).preserveFirst = value;
                    }
                  }}
                  class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label for="preserve-last" class="block text-sm text-muted-foreground mb-1">Preserve Last N Questions</label>
                <input
                  id="preserve-last"
                  type="number"
                  min="0"
                  value={editingBlock
                    ? (editingBlock.randomization as any)?.preserveLast || 0
                    : (newBlock.randomization as any).preserveLast}
                  oninput={(e) => {
                    const value = parseInt(e.currentTarget.value) || 0;
                    if (editingBlock) {
                      if (!editingBlock.randomization) editingBlock.randomization = { enabled: true } as any;
                      (editingBlock.randomization as any).preserveLast = value;
                    } else {
                      (newBlock.randomization as any).preserveLast = value;
                    }
                  }}
                  class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        {/if}

        {#if (editingBlock ? editingBlock.type : newBlock.type) === 'loop'}
          <div class="border-t border-border pt-4">
            <h4 class="text-sm font-medium text-foreground mb-2">Loop Settings</h4>
            <div class="space-y-3">
              <div>
                <label for="loop-iterations" class="block text-sm text-muted-foreground mb-1">Number of Iterations</label>
                <input
                  id="loop-iterations"
                  type="text"
                  value={editingBlock
                    ? (editingBlock.loop as any)?.iterations || 1
                    : (newBlock.loop as any).iterations}
                  oninput={(e) => {
                    const value = e.currentTarget.value;
                    const numValue = parseInt(value) || 1;
                    if (editingBlock) {
                      if (!editingBlock.loop) editingBlock.loop = { iterations: 1 } as any;
                      (editingBlock.loop as any).iterations = numValue;
                    } else {
                      (newBlock.loop as any).iterations = numValue;
                    }
                  }}
                  class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                  placeholder="Number or formula (e.g., 5 or numTrials)"
                />
              </div>
              <div>
                <label for="loop-variable" class="block text-sm text-muted-foreground mb-1">Iteration Variable (optional)</label>
                <input
                  id="loop-variable"
                  type="text"
                  value={editingBlock
                    ? (editingBlock.loop as any)?.iterationVariable || ''
                    : (newBlock.loop as any).iterationVariable}
                  oninput={(e) => {
                    const value = e.currentTarget.value;
                    if (editingBlock) {
                      if (!editingBlock.loop) editingBlock.loop = { iterations: 1 } as any;
                      (editingBlock.loop as any).iterationVariable = value;
                    } else {
                      (newBlock.loop as any).iterationVariable = value;
                    }
                  }}
                  class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                  placeholder="e.g., currentTrial"
                />
              </div>
              <div>
                <label for="loop-condition" class="block text-sm text-muted-foreground mb-1">Exit Condition (optional)</label>
                <input
                  id="loop-condition"
                  type="text"
                  value={editingBlock
                    ? (editingBlock.loop as any)?.exitCondition || ''
                    : (newBlock.loop as any).exitCondition}
                  oninput={(e) => {
                    const value = e.currentTarget.value;
                    if (editingBlock) {
                      if (!editingBlock.loop) editingBlock.loop = { iterations: 1 } as any;
                      (editingBlock.loop as any).exitCondition = value;
                    } else {
                      (newBlock.loop as any).exitCondition = value;
                    }
                  }}
                  class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                  placeholder="e.g., score > 100"
                />
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="flex justify-end space-x-3 mt-6">
        <button
          onclick={() => { showAddBlock = false; editingBlock = null; addBlockPageId = null; }}
          class="px-4 py-2 text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onclick={editingBlock ? handleUpdateBlock : handleAddBlock}
          class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          {editingBlock ? 'Update' : 'Add'} Block
        </button>
      </div>
    </div>
  </div>
{/if}
