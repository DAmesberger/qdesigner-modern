<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import QuestionVisualRenderer from '$lib/wysiwyg/QuestionVisualRenderer.svelte';
  import QuestionRenderer from '$lib/components/questions/QuestionRenderer.svelte';
  import LiveTestRunner from '$lib/wysiwyg/LiveTestRunner.svelte';
  import { defaultTheme } from '$lib/shared';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { Plus, Minus } from 'lucide-svelte';

  let questionnaireTheme = defaultTheme;
  let showTestRunner = $state(false);

  let questionnaire = $derived(designerStore.questionnaire);
  let variables = $derived(
    questionnaire.variables.reduce(
      (acc, v) => {
        acc[v.id] = v.defaultValue;
        acc[v.name] = v.defaultValue;
        return acc;
      },
      {} as Record<string, any>
    )
  );

  // Zoom state
  let zoomLevel = $state(100);
  const zoomLevels = [50, 75, 90, 100, 110, 125, 150];

  function zoomIn() {
    const currentIndex = zoomLevels.indexOf(zoomLevel);
    if (currentIndex !== -1 && currentIndex < zoomLevels.length - 1) {
      const nextLevel = zoomLevels[currentIndex + 1];
      if (nextLevel !== undefined) zoomLevel = nextLevel;
    }
  }

  function zoomOut() {
    const currentIndex = zoomLevels.indexOf(zoomLevel);
    if (currentIndex > 0) {
      const prevLevel = zoomLevels[currentIndex - 1];
      if (prevLevel !== undefined) zoomLevel = prevLevel;
    }
  }

  function resetZoom() {
    zoomLevel = 100;
  }

  // Make zoom functions accessible for command palette
  if (typeof window !== 'undefined') {
    (window as any).__designerZoom = { zoomIn, zoomOut, resetZoom, getLevel: () => zoomLevel };
    (window as any).__designerTestRunner = { show: () => (showTestRunner = true) };
  }

  // DnD items
  let items = $derived(
    designerStore.currentBlockQuestions?.map((q) => ({
      id: q.id,
      question: q,
    })) || []
  );
  let selectedQuestionId = $derived(
    designerStore.selectedItemType === 'question' ? designerStore.selectedItem?.id : null
  );

  function handleDndConsider(e: CustomEvent) {
    if (!e.detail?.items || !designerStore.currentBlock) return;
    const newItems = e.detail.items;
    const questionIds = newItems.map((item: any) => item.id).filter(Boolean);
    if (questionIds.length > 0) {
      designerStore.updateBlockQuestions(designerStore.currentBlock.id, questionIds);
    }
  }

  function handleDndFinalize(e: CustomEvent) {
    if (!e.detail?.items) return;
    handleDndConsider(e);
  }

  function handleQuestionUpdate(questionId: string, updates: any) {
    designerStore.updateQuestion(questionId, updates);
  }

  function addQuestionOfType(type = 'text-input') {
    const firstPage = designerStore.questionnaire.pages[0];
    const firstBlock = firstPage?.blocks?.[0];
    const target =
      designerStore.currentBlock?.id ||
      firstBlock?.id ||
      designerStore.currentPage?.id ||
      firstPage?.id;
    if (!target) return;
    designerStore.addQuestion(target, type);
  }

  function resolveDroppedQuestionType(payload: Record<string, any>): string | null {
    if (payload.type === 'new-question' && payload.questionType) {
      return payload.questionType;
    }
    if (payload.type === 'new-module' && payload.moduleType) {
      return payload.moduleType;
    }
    return null;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const data = e.dataTransfer?.getData('application/json');
    if (!data) return;

    try {
      const parsedData = JSON.parse(data);
      const type = resolveDroppedQuestionType(parsedData);
      if (type) addQuestionOfType(type);
    } catch {
      // Ignore invalid drag payload.
    }
  }

  function openAddPanel() {
    designerStore.setPanel('add');
  }
</script>

<div
  class="relative h-full overflow-auto canvas-bg"
  data-testid="designer-wysiwyg-canvas"
>
  <!-- Canvas Area -->
  <div class="min-h-full p-8 overflow-auto">
    <div
      class="mx-auto transition-transform duration-200 origin-top"
      style="transform: scale({zoomLevel / 100}); width: {100 / (zoomLevel / 100)}%; max-width: {(300 * 100) / zoomLevel}%;"
    >
      <!-- Page Background -->
      <div
        class="bg-card rounded-[var(--radius)] shadow-[var(--shadow-sm)] border border-transparent min-h-[600px] max-w-3xl mx-auto transition-all duration-200"
        role="group"
        aria-label="Canvas area"
        ondrop={handleDrop}
        ondragover={(e) => e.preventDefault()}
        data-testid="designer-page-canvas"
      >
        <!-- Page Header -->
        <div class="px-8 pt-8 pb-4 border-b border-border">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-foreground">
                {designerStore.currentPage?.name || 'Page 1'}
              </h2>
              {#if designerStore.currentBlock}
                <p class="text-sm text-muted-foreground mt-1 flex items-center">
                  <span class="text-muted-foreground mr-1">&rsaquo;</span>
                  {designerStore.currentBlock.name || 'Untitled Block'}
                  {#if designerStore.currentBlock.type !== 'standard'}
                    <span class="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {designerStore.currentBlock.type}
                    </span>
                  {/if}
                </p>
              {/if}
            </div>

            {#if designerStore.currentPageBlocks.length > 1}
              <div class="flex items-center space-x-2">
                <label for="block-select" class="text-sm text-muted-foreground">Block:</label>
                <select
                  id="block-select"
                  value={designerStore.currentBlock?.id}
                  onchange={(e) => designerStore.setCurrentBlock(e.currentTarget.value)}
                  class="text-sm px-3 py-1 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background"
                  data-testid="designer-block-select"
                >
                  {#each designerStore.currentPageBlocks as block}
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
          {#if items.length === 0 || !designerStore.currentBlock}
            <!-- Minimal Empty State -->
            <button
              type="button"
              class="group w-full flex flex-col items-center justify-center rounded-xl py-20 text-center cursor-pointer hover:bg-muted/30 transition-colors duration-200"
              onclick={openAddPanel}
              data-testid="designer-empty-state"
            >
              <div class="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground/50 group-hover:bg-accent group-hover:text-primary transition-all duration-200">
                <Plus class="w-6 h-6" />
              </div>
              <p class="mt-3 text-sm text-muted-foreground">
                Click <strong>+</strong> or press <kbd class="rounded bg-muted px-1 py-0.5 text-xs">Ctrl+K</kbd> to add your first question
              </p>
            </button>
          {:else}
            <!-- Questions List -->
            {#key designerStore.currentBlock?.id}
              <div
                class="space-y-4"
                use:dndzone={{
                  items: items || [],
                  flipDurationMs: 300,
                  dropTargetStyle: {
                    outline: '2px dashed hsl(var(--primary))',
                    outlineOffset: '4px',
                    backgroundColor: 'hsl(var(--primary) / 0.05)',
                  },
                  dropFromOthersDisabled: false,
                  dragDisabled: false,
                  type: 'questions',
                }}
                onconsider={handleDndConsider}
                onfinalize={handleDndFinalize}
                data-testid="designer-question-list"
              >
                {#each items as item (item.id)}
                  {@const isSelected = selectedQuestionId === item.id}
                  <div
                    animate:flip={{ duration: 300 }}
                    class="relative rounded-xl transition-all duration-200 {isSelected
                      ? 'ring-2 ring-primary shadow-[var(--shadow-glow)]'
                      : 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5'}"
                    data-testid={`designer-question-${item.id}`}
                  >
                    {#if item && item.question}
                      {@const isDisplay = [
                        'text-display',
                        'instruction',
                        'media-display',
                        'webgl',
                        'statistical-feedback',
                        'bar-chart',
                      ].includes(item.question.type)}
                      {#if isDisplay}
                        <div
                          role="button"
                          tabindex="0"
                          class="analytics-wrapper group"
                          class:selected={designerStore.selectedItem?.id === item.id}
                          onclick={() => designerStore.selectItem(item.id, 'question')}
                          onkeydown={(e) =>
                            e.key === 'Enter' && designerStore.selectItem(item.id, 'question')}
                        >
                          <QuestionRenderer question={item.question} mode="preview" {variables} />
                          <div class="absolute inset-0 z-10 cursor-pointer pointer-events-none group-hover:bg-primary/5"></div>
                        </div>
                      {:else}
                        <QuestionVisualRenderer
                          question={item.question}
                          theme={questionnaireTheme}
                          mode="edit"
                          selected={designerStore.selectedItem?.id === item.id}
                          onselect={() => designerStore.selectItem(item.id, 'question')}
                          onupdate={(updates: any) => handleQuestionUpdate(item.id, updates)}
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
      {#if designerStore.questionnaire.pages.length > 1}
        <div class="mt-6 flex items-center justify-center gap-1.5">
          {#each designerStore.questionnaire.pages as page, index}
            {@const isActive = page.id === designerStore.currentPage?.id}
            <button
              class="rounded-full transition-all duration-200 {isActive
                ? 'w-6 h-2 bg-primary'
                : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'}"
              onclick={() => designerStore.setCurrentPage(page.id)}
              title="Page {index + 1}"
              aria-label="Go to page {index + 1}"
            ></button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Floating Zoom Pill -->
  <div
    class="absolute bottom-4 right-4 flex items-center bg-[hsl(var(--glass-bg))] backdrop-blur-[var(--glass-blur)] shadow-[var(--shadow-md)] rounded-full px-1 py-0.5 text-xs text-muted-foreground border border-[hsl(var(--glass-border))]"
    data-testid="designer-zoom-pill"
  >
    <button
      onclick={zoomOut}
      disabled={zoomLevel === 50}
      class="px-1.5 py-0.5 rounded-full hover:bg-accent hover:text-foreground transition-colors duration-150 disabled:opacity-40"
      aria-label="Zoom out"
      data-testid="designer-canvas-zoom-out"
    >
      <Minus class="w-3 h-3" />
    </button>
    <button
      onclick={resetZoom}
      class="px-1.5 py-0.5 min-w-[3rem] text-center hover:bg-accent hover:text-foreground rounded-full transition-colors duration-150"
      data-testid="designer-canvas-zoom-level"
      title="Reset zoom"
    >
      {zoomLevel}%
    </button>
    <button
      onclick={zoomIn}
      disabled={zoomLevel === 150}
      class="px-1.5 py-0.5 rounded-full hover:bg-accent hover:text-foreground transition-colors duration-150 disabled:opacity-40"
      aria-label="Zoom in"
      data-testid="designer-canvas-zoom-in"
    >
      <Plus class="w-3 h-3" />
    </button>
  </div>
</div>

<!-- Test Runner -->
{#if showTestRunner}
  <LiveTestRunner
    questionnaire={designerStore.questionnaire}
    theme={questionnaireTheme}
    startPageId={designerStore.currentPage?.id}
    showDebugInfo={true}
    onclose={() => (showTestRunner = false)}
  />
{/if}

<style>
  .canvas-bg {
    background-color: hsl(var(--background));
    background-image: radial-gradient(circle, hsl(var(--border) / 0.4) 1px, transparent 1px);
    background-size: 20px 20px;
  }

  .analytics-wrapper {
    position: relative;
    border-radius: 0.5rem;
    transition: all 0.2s ease;
  }

  .analytics-wrapper.selected {
    outline: 2px solid hsl(var(--primary));
    outline-offset: 2px;
  }
</style>
