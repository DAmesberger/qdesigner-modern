<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  import { nanoid } from 'nanoid';
  import FlowControlEditor from './flow/FlowControlEditor.svelte';
  import theme from '$lib/theme';

  // Use derived state instead of local state + subscribe
  let flowControls = $derived(designerStore.questionnaire.flow || []);

  let showFlowEditor = $state(false);
  let editingFlow = $state<FlowControl | null>(null);
  let showAddFlow = $state(false);

  // Form state for new flow
  let newFlow = $state({
    type: 'branch' as FlowControl['type'],
    condition: '',
    target: '',
    iterations: undefined as number | undefined,
  });

  // Get available targets (pages and questions)
  let availableTargets = $derived(
    (() => {
      const targets: Array<{ id: string; label: string; type: string }> = [];
      const pages = designerStore.questionnaire.pages || [];
      const questions = designerStore.questionnaire.questions || [];

      // Add pages
      pages.forEach((page, index) => {
        targets.push({
          id: page.id,
          label: `Page: ${page.name || `Page ${index + 1}`}`,
          type: 'page',
        });
      });

      // Add questions
      questions.forEach((question) => {
        const pageName =
          pages.find(
            (p) =>
              p.questions?.includes(question.id) ||
              p.blocks?.some((b) => b.questions.includes(question.id))
          )?.name || 'Unknown Page';

        targets.push({
          id: question.id,
          label: `Q: ${question.name || question.id} (${pageName})`,
          type: 'question',
        });
      });

      return targets;
    })()
  );

  function handleAddFlow() {
    if (!newFlow.condition) return;

    const flow: FlowControl = {
      id: `flow-${nanoid(6)}`,
      type: newFlow.type,
      condition: newFlow.condition,
      target: newFlow.target || undefined,
      iterations: newFlow.type === 'loop' ? newFlow.iterations : undefined,
    };

    designerStore.addFlowControl(flow);
    resetForm();
    showAddFlow = false;
  }

  function handleUpdateFlow(flowId: string, updates: Partial<FlowControl>) {
    const index = flowControls.findIndex((f) => f.id === flowId);
    if (index !== -1) {
      const updatedFlows = [...flowControls];
      const existingFlow = updatedFlows[index];
      if (existingFlow) {
        const merged: FlowControl = {
          ...existingFlow,
          ...updates,
          id: existingFlow.id,
          // Ensure mandatory fields are present if missing in updates or existing
          type: (updates.type || existingFlow.type || 'branch') as FlowControl['type'],
          condition: updates.condition || existingFlow.condition || '',
        };
        updatedFlows[index] = merged;
        designerStore.updateQuestionnaire({ flow: updatedFlows });
      }
    }
  }

  function handleDeleteFlow(flowId: string) {
    const updatedFlows = flowControls.filter((f) => f.id !== flowId);
    designerStore.updateQuestionnaire({ flow: updatedFlows });
  }

  function handleFlowUpdate(updatedFlows: FlowControl[]) {
    designerStore.updateQuestionnaire({ flow: updatedFlows });
  }

  function resetForm() {
    newFlow = {
      type: 'branch',
      condition: '',
      target: '',
      iterations: undefined,
    };
  }

  function getFlowIcon(type: FlowControl['type']): string {
    const icons: Record<string, string> = {
      skip: '⤵️',
      branch: '🔀',
      loop: '🔁',
      terminate: '⏹️',
    };
    return icons[type] || '❓';
  }
</script>

<div class="{theme.components.container.card} p-4">
  <div class="flex items-center justify-between mb-4">
    <h3 class="{theme.typography.h4} {theme.semantic.textPrimary}">Flow Control</h3>
    <div class="flex gap-2">
      <button
        onclick={() => (showFlowEditor = true)}
        class="{theme.components.button.variants.outline} {theme.components.button.sizes
          .sm} rounded-md"
        title="Visual Flow Editor"
        aria-label="Open Visual Flow Editor"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
      </button>
      <button
        onclick={() => (showAddFlow = true)}
        class="{theme.components.button.variants.default} {theme.components.button.sizes
          .sm} rounded-md"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add Flow
      </button>
    </div>
  </div>

  {#if flowControls.length === 0}
    <div class="text-center py-8">
      <p class={theme.semantic.textSecondary}>No flow controls defined</p>
      <p class="{theme.typography.caption} text-gray-400 mt-2">
        Add flow controls to create conditional logic, loops, and branching
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each flowControls as flow}
        <div class="{theme.semantic.bgSubtle} p-3 rounded-md border {theme.semantic.borderDefault}">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-lg">{getFlowIcon(flow.type)}</span>
                <span class="{theme.typography.label} {theme.semantic.textPrimary} capitalize">
                  {flow.type}
                </span>
              </div>

              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="{theme.typography.caption} {theme.semantic.textSecondary}"
                    >Condition:</span
                  >
                  <code class="text-xs bg-gray-100 px-2 py-1 rounded">{flow.condition}</code>
                </div>

                {#if flow.target}
                  <div class="flex items-center gap-2">
                    <span class="{theme.typography.caption} {theme.semantic.textSecondary}"
                      >Target:</span
                    >
                    <span class={theme.typography.caption}>{flow.target}</span>
                  </div>
                {/if}

                {#if flow.iterations}
                  <div class="flex items-center gap-2">
                    <span class="{theme.typography.caption} {theme.semantic.textSecondary}"
                      >Iterations:</span
                    >
                    <span class={theme.typography.caption}>{flow.iterations}</span>
                  </div>
                {/if}
              </div>
            </div>

            <div class="flex items-center gap-1">
              <button
                onclick={() => {
                  editingFlow = flow;
                  newFlow = {
                    type: flow.type,
                    condition: flow.condition,
                    target: flow.target || '',
                    iterations: flow.iterations,
                  };
                  showAddFlow = true;
                }}
                class="p-1 {theme.semantic.interactive.ghost} rounded"
                title="Edit"
                aria-label="Edit Flow"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onclick={() => handleDeleteFlow(flow.id)}
                class="p-1 {theme.semantic.interactive.ghost} rounded text-red-600"
                title="Delete"
                aria-label="Delete Flow"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Add/Edit Flow Modal -->
{#if showAddFlow}
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="fixed inset-0 bg-black bg-opacity-50" aria-hidden="true"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      onclick={() => {
        showAddFlow = false;
        editingFlow = null;
        resetForm();
      }}
    >
      <div class="{theme.components.container.card} relative max-w-md w-full p-6">
        <h3 class="{theme.typography.h4} {theme.semantic.textPrimary} mb-4">
          {editingFlow ? 'Edit' : 'Add'} Flow Control
        </h3>

        <div class="space-y-4">
          <!-- Flow Type -->
          <div>
            <label
              for="flow-type"
              class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block"
            >
              Type
            </label>
            <select
              id="flow-type"
              bind:value={newFlow.type}
              class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              disabled={editingFlow !== null}
            >
              <option value="skip">Skip - Jump to another question/page</option>
              <option value="branch">Branch - Conditional navigation</option>
              <option value="loop">Loop - Repeat section</option>
              <option value="terminate">Terminate - End questionnaire</option>
            </select>
          </div>

          <!-- Condition -->
          <div>
            <label
              for="flow-condition"
              class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block"
            >
              Condition
            </label>
            <input
              id="flow-condition"
              type="text"
              bind:value={newFlow.condition}
              placeholder="e.g., age >= 18 && consent === true"
              class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p class="{theme.typography.caption} {theme.semantic.textSecondary} mt-1">
              Use variable names and JavaScript expressions
            </p>
          </div>

          <!-- Target (for skip/branch) -->
          {#if newFlow.type === 'skip' || newFlow.type === 'branch'}
            <div>
              <label
                for="flow-target"
                class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block"
              >
                Target
              </label>
              <select
                id="flow-target"
                bind:value={newFlow.target}
                class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select target...</option>
                {#each availableTargets as target}
                  <option value={target.id}>{target.label}</option>
                {/each}
              </select>
            </div>
          {/if}

          <!-- Iterations (for loops) -->
          {#if newFlow.type === 'loop'}
            <div>
              <label
                for="flow-iterations"
                class="{theme.typography.label} {theme.semantic.textPrimary} mb-2 block"
              >
                Max Iterations
              </label>
              <input
                id="flow-iterations"
                type="number"
                bind:value={newFlow.iterations}
                min="1"
                max="100"
                class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          {/if}
        </div>

        <div class="flex justify-end gap-2 mt-6">
          <button
            onclick={() => {
              showAddFlow = false;
              editingFlow = null;
              resetForm();
            }}
            class="{theme.components.button.variants.outline} {theme.components.button.sizes
              .sm} rounded-md"
          >
            Cancel
          </button>
          <button
            onclick={() => {
              if (editingFlow) {
                handleUpdateFlow(editingFlow.id, {
                  type: newFlow.type,
                  condition: newFlow.condition,
                  target: newFlow.target || undefined,
                  iterations: newFlow.iterations,
                });
                editingFlow = null;
                showAddFlow = false;
                resetForm();
              } else {
                handleAddFlow();
              }
            }}
            disabled={!newFlow.condition}
            class="{theme.components.button.variants.default} {theme.components.button.sizes
              .sm} rounded-md disabled:opacity-50"
          >
            {editingFlow ? 'Update' : 'Add'} Flow
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Visual Flow Editor Modal -->
{#if showFlowEditor}
  <div class="fixed inset-0 bg-black bg-opacity-50" aria-hidden="true"></div>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
    <div
      class="fixed inset-4 {theme.components.container.card} flex flex-col pointer-events-auto"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between p-4 border-b {theme.semantic.borderDefault}">
        <h3 class="{theme.typography.h3} {theme.semantic.textPrimary}">
          Flow Control Visual Editor
        </h3>
        <button
          onclick={() => (showFlowEditor = false)}
          class="p-2 {theme.semantic.interactive.ghost} rounded-md"
          aria-label="Close editor"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-hidden">
        <FlowControlEditor {flowControls} onUpdate={handleFlowUpdate} />
      </div>
    </div>
  </div>
{/if}
