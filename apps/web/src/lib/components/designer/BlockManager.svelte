<script lang="ts">
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import type { Block, Question, ExperimentalCondition, AdaptiveBlockConfig } from '$lib/shared';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import AdaptiveBlockEditor from '$lib/components/designer/AdaptiveBlockEditor.svelte';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
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
  import Select from '$lib/components/ui/forms/Select.svelte';

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
  const showBlockDialog = $derived(showAddBlock || editingBlock !== null);

  const blockTypes = [
    { type: 'standard' as const, name: 'Standard Block', description: 'Questions appear in order' },
    { type: 'randomized' as const, name: 'Randomized Block', description: 'Questions appear in random order' },
    { type: 'conditional' as const, name: 'Conditional Block', description: 'Block shown based on conditions' },
    { type: 'loop' as const, name: 'Loop Block', description: 'Repeat questions multiple times' },
    { type: 'adaptive' as const, name: 'Adaptive Block', description: 'CAT/IRT item bank — items adapt to ability' },
  ];

  let newBlock = $state({
    name: '',
    type: 'standard' as Block['type'],
    condition: '' as string,
    conditions: [] as any[],
    randomization: { enabled: false, preserveLast: 0 } as any,
    loop: { iterations: 1, iterationVariable: '', exitCondition: '' } as any,
    adaptive: undefined as AdaptiveBlockConfig | undefined,
  });

  /**
   * Ensure the active draft (create or edit path) carries an adaptive config object so
   * AdaptiveBlockEditor — which mutates its `config` prop in place — has a stable,
   * reactive reference to write into. Call this ONLY from event handlers (dialog open,
   * type selection), never from the template: creating the object during render is a
   * `$state` mutation inside a template expression, which Svelte 5 rejects with
   * `state_unsafe_mutation` and wedges the dialog (F-35).
   */
  function ensureAdaptiveConfig(): void {
    if (editingBlock) {
      if (!editingBlock.adaptive) editingBlock.adaptive = { items: [] };
    } else if (!newBlock.adaptive) {
      newBlock.adaptive = { items: [] };
    }
  }

  /** Set the active draft's block type (event handler); seed adaptive config on demand. */
  function chooseBlockType(type: Block['type']): void {
    if (editingBlock) {
      editingBlock.type = type;
    } else {
      newBlock.type = type;
    }
    if (type === 'adaptive') ensureAdaptiveConfig();
  }

  let experimentalConditions = $derived(
    designerStore.questionnaire.settings.experimentalDesign?.conditions ?? []
  );

  // --- Loop-over-a-list authoring (E-FLOW-4) ---------------------------------
  // The runtime consumes LoopConfig.{values, source, loopVariableName, maxIterations}
  // to repeat a battery once per value (roster looping). The legacy `iterations`
  // count above is a separate, count-only mode; these fields drive value looping.

  /** The loop object currently being edited (create or edit path). */
  const activeLoop = $derived(
    (editingBlock ? (editingBlock.loop as any) : (newBlock.loop as any)) ?? {}
  );

  /** Patch the active block's loop config in place (reactively persisted on save). */
  function patchLoop(patch: Record<string, unknown>): void {
    if (editingBlock) {
      if (!editingBlock.loop) editingBlock.loop = {} as any;
      Object.assign(editingBlock.loop as any, patch);
    } else {
      if (!newBlock.loop) newBlock.loop = {} as any;
      Object.assign(newBlock.loop as any, patch);
    }
  }

  /** Static values as newline-separated editable text. */
  const loopValuesText = $derived(
    Array.isArray(activeLoop.values) ? activeLoop.values.join('\n') : ''
  );

  function setLoopValuesText(text: string): void {
    const values = text
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    patchLoop({ values });
  }

  const loopSourceType = $derived((activeLoop.source?.type as string) ?? 'static');

  /** Live iteration-count preview (step 8). Dynamic sources are runtime-resolved. */
  const loopPreview = $derived.by(() => {
    const cap = typeof activeLoop.maxIterations === 'number' ? activeLoop.maxIterations : undefined;
    if (loopSourceType === 'static') {
      const n = Array.isArray(activeLoop.values) ? activeLoop.values.length : 0;
      const capped = cap ? Math.min(n, cap) : n;
      return `${capped} iteration${capped === 1 ? '' : 's'}`;
    }
    const src =
      loopSourceType === 'answer'
        ? `answer of "${activeLoop.source?.questionId || '(unset)'}"`
        : `variable "${activeLoop.source?.variableId || '(unset)'}"`;
    return `resolved at runtime from ${src}${cap ? ` (max ${cap})` : ''}`;
  });

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

    // Use the id addBlock just recorded rather than re-deriving the "last block"
    // from the reactive questionnaire view — under the collaborative Y.Doc path
    // that view can lag the write, so blocks[length-1] would target the wrong
    // (or a stale) block and the adaptive/randomization/loop config would be
    // dropped or applied to the wrong block.
    const newBlockId = designerStore.currentBlockId;
    if (newBlockId) {
      designerStore.updateBlock(newBlockId, {
        name: newBlock.name,
        condition: newBlock.condition || undefined,
        randomization: newBlock.type === 'randomized' ? { ...newBlock.randomization } : undefined,
        loop: newBlock.type === 'loop' ? { ...newBlock.loop } : undefined,
        adaptive: newBlock.type === 'adaptive' ? (newBlock.adaptive ?? { items: [] }) : undefined,
      });
    }

    newBlock = {
      name: '',
      type: 'standard',
      condition: '',
      conditions: [],
      randomization: { enabled: false, preserveLast: 0 } as any,
      loop: { iterations: 1, iterationVariable: '', exitCondition: '' },
      adaptive: undefined,
    };
    showAddBlock = false;
    addBlockPageId = null;
  }

  function handleEditBlock(block: Block) {
    editingBlock = { ...block };
    // Normalize the adaptive config up front (on open) so the template only reads it.
    if (editingBlock.type === 'adaptive') ensureAdaptiveConfig();
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
      adaptive: editingBlock.type === 'adaptive' ? (editingBlock.adaptive ?? { items: [] }) : undefined,
    });
    editingBlock = null;
  }

  async function handleDeleteBlock(blockId: string) {
    if (
      await confirmDialog({
        title: 'Delete block?',
        message: 'Delete this block? All questions in this block will be deleted.',
        confirmLabel: 'Delete',
        destructive: true,
      })
    ) {
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
                        {:else if block.type === 'adaptive'}<BarChart3 class="w-3.5 h-3.5" />
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
                              {:else if question.type === 'reaction-experiment'}<Zap class="w-3 h-3" />
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
<Dialog
  open={showBlockDialog}
  title={editingBlock ? 'Edit Block' : 'Add Block'}
  size="md"
  onclose={() => { showAddBlock = false; editingBlock = null; addBlockPageId = null; }}
>
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
                onclick={() => chooseBlockType(blockType.type)}
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
                    {:else if blockType.type === 'adaptive'}<BarChart3 class="w-5 h-5" />
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
            <Select
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
              placeholder=""
            >
              <option value="">None (always shown)</option>
              {#each experimentalConditions as cond}
                <option value={cond.name}>{cond.name}</option>
              {/each}
            </Select>
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

              <!-- Loop over a list (roster looping, E-FLOW-4) -->
              <div class="border-t border-border/60 pt-3 mt-1">
                <div class="flex items-center justify-between mb-1">
                  <h5 class="text-sm font-medium text-foreground">Loop over a list (roster)</h5>
                  <span class="text-xs text-muted-foreground">{loopPreview}</span>
                </div>
                <p class="text-xs text-muted-foreground mb-2">
                  Repeats this block's questions once per value. Pipe the current value into
                  prompts / options with <code>{'{{loopValue}}'}</code>.
                </p>

                <div class="mb-2">
                  <label for="loop-source" class="block text-sm text-muted-foreground mb-1">Value source</label>
                  <select
                    id="loop-source"
                    value={loopSourceType}
                    onchange={(e) => {
                      const type = e.currentTarget.value as 'static' | 'answer' | 'variable';
                      patchLoop({ source: type === 'static' ? undefined : { type } });
                    }}
                    class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                  >
                    <option value="static">Static list</option>
                    <option value="answer">Prior question's answer</option>
                    <option value="variable">Variable (array)</option>
                  </select>
                </div>

                {#if loopSourceType === 'static'}
                  <div class="mb-2">
                    <label for="loop-values" class="block text-sm text-muted-foreground mb-1">Values (one per line)</label>
                    <textarea
                      id="loop-values"
                      rows="4"
                      value={loopValuesText}
                      oninput={(e) => setLoopValuesText(e.currentTarget.value)}
                      class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary font-mono text-sm"
                      placeholder={'Mother\nFather\nSibling'}
                    ></textarea>
                  </div>
                {:else if loopSourceType === 'answer'}
                  <div class="mb-2">
                    <label for="loop-answer-qid" class="block text-sm text-muted-foreground mb-1">Source question ID</label>
                    <input
                      id="loop-answer-qid"
                      type="text"
                      value={activeLoop.source?.questionId || ''}
                      oninput={(e) =>
                        patchLoop({ source: { type: 'answer', questionId: e.currentTarget.value } })}
                      class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                      placeholder="e.g., q_selected_people"
                    />
                  </div>
                {:else}
                  <div class="mb-2">
                    <label for="loop-var-id" class="block text-sm text-muted-foreground mb-1">Source variable name</label>
                    <input
                      id="loop-var-id"
                      type="text"
                      value={activeLoop.source?.variableId || ''}
                      oninput={(e) =>
                        patchLoop({ source: { type: 'variable', variableId: e.currentTarget.value } })}
                      class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                      placeholder="e.g., stimulusList"
                    />
                  </div>
                {/if}

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label for="loop-var-name" class="block text-sm text-muted-foreground mb-1">Loop variable name</label>
                    <input
                      id="loop-var-name"
                      type="text"
                      value={activeLoop.loopVariableName || ''}
                      oninput={(e) => patchLoop({ loopVariableName: e.currentTarget.value || undefined })}
                      class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                      placeholder="loopValue"
                    />
                  </div>
                  <div>
                    <label for="loop-max" class="block text-sm text-muted-foreground mb-1">Max iterations</label>
                    <input
                      id="loop-max"
                      type="number"
                      min="1"
                      value={activeLoop.maxIterations ?? ''}
                      oninput={(e) => {
                        const n = parseInt(e.currentTarget.value);
                        patchLoop({ maxIterations: Number.isFinite(n) && n > 0 ? n : undefined });
                      }}
                      class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                      placeholder="unbounded"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        {#if (editingBlock ? editingBlock.type : newBlock.type) === 'adaptive'}
          {@const adaptiveConfig = editingBlock ? editingBlock.adaptive : newBlock.adaptive}
          {#if adaptiveConfig}
            <AdaptiveBlockEditor
              config={adaptiveConfig}
              questionIds={editingBlock ? (editingBlock.questions ?? []) : []}
              allQuestions={designerStore.questionnaire.questions}
            />
          {/if}
        {/if}
  </div>

  {#snippet footer()}
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
  {/snippet}
</Dialog>
