<script lang="ts">
  import { designerStore, currentPageBlocks, currentBlock } from '$lib/stores/designerStore';
  import { flip } from 'svelte/animate';
  import { dndzone } from 'svelte-dnd-action';
  import type { Block } from '$lib/shared';
  import theme from '$lib/theme';
  
  let showAddBlock = false;
  let editingBlock: Block | null = null;
  let dragDisabled = true;
  
  // Block types with descriptions
  const blockTypes = [
    { 
      type: 'standard' as const, 
      name: 'Standard Block',
      icon: '📄',
      description: 'Questions appear in order'
    },
    { 
      type: 'randomized' as const, 
      name: 'Randomized Block',
      icon: '🔀',
      description: 'Questions appear in random order'
    },
    { 
      type: 'conditional' as const, 
      name: 'Conditional Block',
      icon: '🔄',
      description: 'Block shown based on conditions'
    },
    { 
      type: 'loop' as const, 
      name: 'Loop Block',
      icon: '🔁',
      description: 'Repeat questions multiple times'
    }
  ];
  
  // Form state for new block
  let newBlock = {
    name: '',
    type: 'standard' as Block['type'],
    conditions: [] as any[],
    randomization: {
      enabled: false,
      preserveFirst: 0,
      preserveLast: 0
    },
    loop: {
      iterations: 1,
      iterationVariable: '',
      exitCondition: ''
    }
  };
  
  function handleDndConsider(e: CustomEvent) {
    const items = e.detail.items as Array<{id: string}>;
    const pageId = $designerStore.currentPageId;
    if (!pageId) return;
    
    // Update block order
    const blockIds = items.map(item => item.id);
    const page = $designerStore.questionnaire.pages.find(p => p.id === pageId);
    if (page) {
      page.blocks = page.blocks.sort((a, b) => 
        blockIds.indexOf(a.id) - blockIds.indexOf(b.id)
      );
    }
  }
  
  function handleDndFinalize(e: CustomEvent) {
    const items = e.detail.items as Array<{id: string}>;
    const pageId = $designerStore.currentPageId;
    if (!pageId) return;
    
    // Finalize block order
    const blockIds = items.map(item => item.id);
    const page = $designerStore.questionnaire.pages.find(p => p.id === pageId);
    if (page) {
      const orderedBlocks = blockIds.map(id => 
        page.blocks.find(b => b.id === id)!
      );
      page.blocks = orderedBlocks;
    }
    dragDisabled = true;
  }
  
  function handleAddBlock() {
    if (!newBlock.name || !$designerStore.currentPageId) return;
    
    designerStore.addBlock($designerStore.currentPageId, newBlock.type);
    
    // Update the newly created block with additional properties
    const page = $designerStore.questionnaire.pages.find(p => p.id === $designerStore.currentPageId);
    if (page && page.blocks.length > 0) {
      const latestBlock = page.blocks[page.blocks.length - 1];
      designerStore.updateBlock(latestBlock.id, {
        name: newBlock.name,
        randomization: newBlock.type === 'randomized' ? { ...newBlock.randomization } : undefined,
        loop: newBlock.type === 'loop' ? { ...newBlock.loop } : undefined
      });
    }
    
    // Reset form
    newBlock = {
      name: '',
      type: 'standard',
      conditions: [],
      randomization: {
        enabled: false,
        preserveFirst: 0,
        preserveLast: 0
      },
      loop: {
        iterations: 1,
        iterationVariable: '',
        exitCondition: ''
      }
    };
    showAddBlock = false;
  }
  
  function handleEditBlock(block: Block) {
    editingBlock = { ...block };
  }
  
  function handleUpdateBlock() {
    if (!editingBlock) return;
    
    designerStore.updateBlock(editingBlock.id, {
      name: editingBlock.name,
      type: editingBlock.type,
      conditions: editingBlock.conditions,
      randomization: editingBlock.randomization,
      loop: editingBlock.loop
    });
    
    editingBlock = null;
  }
  
  function handleDeleteBlock(blockId: string) {
    if (confirm('Delete this block? All questions in this block will be deleted.')) {
      designerStore.deleteBlock(blockId);
    }
  }
  
  function handleSelectBlock(blockId: string) {
    designerStore.selectItem(blockId, 'block');
    designerStore.setCurrentBlock(blockId);
  }
  
  function getBlockIcon(type: Block['type']): string {
    return blockTypes.find(t => t.type === type)?.icon || '📄';
  }
  
  function getBlockDescription(block: Block): string {
    switch (block.type) {
      case 'randomized':
        return `${block.questions.length} questions (randomized)`;
      case 'conditional':
        return `${block.questions.length} questions (conditional)`;
      case 'loop':
        const iterations = block.loop?.iterations || 1;
        return `${block.questions.length} questions × ${iterations} iterations`;
      default:
        return `${block.questions.length} questions`;
    }
  }
</script>

<div class="{theme.components.container.card}">
  <div class="p-4 border-b {theme.semantic.borderDefault}">
    <div class="flex items-center justify-between">
      <h3 class="{theme.typography.h4} {theme.semantic.textPrimary}">Blocks</h3>
      <div class="flex items-center space-x-2">
        <button
          on:click={() => dragDisabled = !dragDisabled}
          class="{theme.components.button.variants.secondary} {theme.components.button.sizes.sm} rounded-md"
          title={dragDisabled ? 'Enable reordering' : 'Disable reordering'}
        >
          {dragDisabled ? '🔒' : '🔓'} Reorder
        </button>
        <button
          on:click={() => showAddBlock = true}
          class="{theme.components.button.variants.default} {theme.components.button.sizes.sm} rounded-md"
        >
          Add Block
        </button>
      </div>
    </div>
  </div>

  <div class="p-4">
    {#if $currentPageBlocks.length > 0}
      <div 
        class="space-y-2"
        use:dndzone={{
          items: $currentPageBlocks.map(b => ({ id: b.id })),
          flipDurationMs: 300,
          dragDisabled,
          dropTargetStyle: {}
        }}
        on:consider={handleDndConsider}
        on:finalize={handleDndFinalize}
      >
        {#each $currentPageBlocks as block (block.id)}
          <div
            animate:flip={{duration: 300}}
            class="block-item"
          >
            <div
              on:click={() => handleSelectBlock(block.id)}
              class="p-3 border rounded-lg cursor-pointer transition-all
                     {$currentBlock?.id === block.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}"
            >
              <div class="flex items-start justify-between">
                <div class="flex items-start space-x-2 flex-1">
                  <span class="text-lg mt-0.5" role="img" aria-label={block.type}>
                    {getBlockIcon(block.type)}
                  </span>
                  
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <h4 class="font-medium text-gray-900">{block.name || 'Untitled Block'}</h4>
                      <span class="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                        {block.type}
                      </span>
                    </div>
                    
                    <p class="text-sm text-gray-600 mt-1">
                      {getBlockDescription(block)}
                    </p>
                    
                    {#if block.conditions && block.conditions.length > 0}
                      <div class="flex items-center mt-2 text-xs text-yellow-600">
                        <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                        Has conditions
                      </div>
                    {/if}
                  </div>
                </div>

                <div class="flex items-center space-x-1 ml-2">
                  {#if !dragDisabled}
                    <div class="drag-handle p-1 cursor-move">
                      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                  {/if}
                  
                  <button
                    on:click|stopPropagation={() => handleEditBlock(block)}
                    class="p-1 hover:bg-gray-100 rounded"
                    title="Edit"
                  >
                    <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  
                  <button
                    on:click|stopPropagation={() => handleDeleteBlock(block.id)}
                    class="p-1 hover:bg-red-100 rounded"
                    title="Delete"
                  >
                    <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-gray-500 text-center py-8">
        No blocks yet. Add blocks to organize your questions.
      </p>
    {/if}
  </div>
</div>

<!-- Add/Edit Block Modal -->
{#if showAddBlock || editingBlock}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
      <h3 class="text-lg font-semibold mb-4">
        {editingBlock ? 'Edit Block' : 'Add Block'}
      </h3>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={editingBlock ? editingBlock.name : newBlock.name}
            on:input={(e) => {
              const value = e.currentTarget.value;
              if (editingBlock) {
                editingBlock.name = value;
              } else {
                newBlock.name = value;
              }
            }}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Demographics, Pre-test Questions"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <div class="grid grid-cols-2 gap-2">
            {#each blockTypes as blockType}
              <button
                on:click={() => {
                  if (editingBlock) {
                    editingBlock.type = blockType.type;
                  } else {
                    newBlock.type = blockType.type;
                  }
                }}
                class="p-3 border rounded-lg text-left transition-all
                       {(editingBlock ? editingBlock.type : newBlock.type) === blockType.type 
                         ? 'border-blue-500 bg-blue-50' 
                         : 'border-gray-200 hover:border-gray-300'}"
              >
                <div class="flex items-start space-x-2">
                  <span class="text-lg">{blockType.icon}</span>
                  <div>
                    <h4 class="font-medium text-sm">{blockType.name}</h4>
                    <p class="text-xs text-gray-600 mt-0.5">{blockType.description}</p>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>

        {#if (editingBlock ? editingBlock.type : newBlock.type) === 'randomized'}
          <div class="border-t pt-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Randomization Settings</h4>
            
            <div class="space-y-3">
              <div>
                <label class="block text-sm text-gray-600 mb-1">Preserve First N Questions</label>
                <input
                  type="number"
                  min="0"
                  value={editingBlock ? editingBlock.randomization?.preserveFirst || 0 : newBlock.randomization.preserveFirst}
                  on:input={(e) => {
                    const value = parseInt(e.currentTarget.value) || 0;
                    if (editingBlock) {
                      if (!editingBlock.randomization) editingBlock.randomization = { enabled: true };
                      editingBlock.randomization.preserveFirst = value;
                    } else {
                      newBlock.randomization.preserveFirst = value;
                    }
                  }}
                  class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label class="block text-sm text-gray-600 mb-1">Preserve Last N Questions</label>
                <input
                  type="number"
                  min="0"
                  value={editingBlock ? editingBlock.randomization?.preserveLast || 0 : newBlock.randomization.preserveLast}
                  on:input={(e) => {
                    const value = parseInt(e.currentTarget.value) || 0;
                    if (editingBlock) {
                      if (!editingBlock.randomization) editingBlock.randomization = { enabled: true };
                      editingBlock.randomization.preserveLast = value;
                    } else {
                      newBlock.randomization.preserveLast = value;
                    }
                  }}
                  class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        {/if}

        {#if (editingBlock ? editingBlock.type : newBlock.type) === 'loop'}
          <div class="border-t pt-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Loop Settings</h4>
            
            <div class="space-y-3">
              <div>
                <label class="block text-sm text-gray-600 mb-1">Number of Iterations</label>
                <input
                  type="text"
                  value={editingBlock ? editingBlock.loop?.iterations || 1 : newBlock.loop.iterations}
                  on:input={(e) => {
                    const value = e.currentTarget.value;
                    if (editingBlock) {
                      if (!editingBlock.loop) editingBlock.loop = { iterations: 1 };
                      editingBlock.loop.iterations = value;
                    } else {
                      newBlock.loop.iterations = value;
                    }
                  }}
                  class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Number or formula (e.g., 5 or numTrials)"
                />
              </div>
              
              <div>
                <label class="block text-sm text-gray-600 mb-1">Iteration Variable (optional)</label>
                <input
                  type="text"
                  value={editingBlock ? editingBlock.loop?.iterationVariable || '' : newBlock.loop.iterationVariable}
                  on:input={(e) => {
                    const value = e.currentTarget.value;
                    if (editingBlock) {
                      if (!editingBlock.loop) editingBlock.loop = { iterations: 1 };
                      editingBlock.loop.iterationVariable = value;
                    } else {
                      newBlock.loop.iterationVariable = value;
                    }
                  }}
                  class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., currentTrial"
                />
              </div>
              
              <div>
                <label class="block text-sm text-gray-600 mb-1">Exit Condition (optional)</label>
                <input
                  type="text"
                  value={editingBlock ? editingBlock.loop?.exitCondition || '' : newBlock.loop.exitCondition}
                  on:input={(e) => {
                    const value = e.currentTarget.value;
                    if (editingBlock) {
                      if (!editingBlock.loop) editingBlock.loop = { iterations: 1 };
                      editingBlock.loop.exitCondition = value;
                    } else {
                      newBlock.loop.exitCondition = value;
                    }
                  }}
                  class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., score > 100"
                />
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="flex justify-end space-x-3 mt-6">
        <button
          on:click={() => {
            showAddBlock = false;
            editingBlock = null;
          }}
          class="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          on:click={editingBlock ? handleUpdateBlock : handleAddBlock}
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {editingBlock ? 'Update' : 'Add'} Block
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .block-item {
    transition: transform 0.2s;
  }
  
  .drag-handle {
    cursor: move;
  }
  
  :global(.block-item.gu-mirror) {
    transform: rotate(2deg);
    opacity: 0.8;
  }
</style>