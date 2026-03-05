<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { FlowControl } from '$lib/shared/types/questionnaire';
  import { nanoid } from 'nanoid';
  import FlowControlEditor from './flow/FlowControlEditor.svelte';
  import { CornerDownRight, GitBranch, Repeat, Square, HelpCircle, Pencil, Trash2, Plus, Map, X } from 'lucide-svelte';
  import HelpTip from '$lib/help/components/HelpTip.svelte';

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

  function getTargetLabel(targetId?: string): string {
    if (!targetId) return 'No target';
    const match = availableTargets.find((target) => target.id === targetId);
    return match?.label || targetId;
  }

  function validateFlow(flow: FlowControl): string[] {
    const issues: string[] = [];
    if (!flow.condition || flow.condition.trim().length === 0) {
      issues.push('Missing condition.');
    }

    if ((flow.type === 'skip' || flow.type === 'branch') && !flow.target) {
      issues.push('Skip/branch flows require a target.');
    }

    if (flow.type === 'loop' && (!flow.iterations || flow.iterations < 1)) {
      issues.push('Loop flows need at least 1 iteration.');
    }

    return issues;
  }
</script>

<div class="bg-card rounded-[var(--radius)] shadow-[var(--shadow-sm)] border border-border text-card-foreground p-4">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-sm font-semibold text-foreground flex items-center gap-1">Flow Control <HelpTip helpKey="flowControl.overview" /></h3>
    <div class="flex gap-2">
      <button
        onclick={() => (showFlowEditor = true)}
        class="border border-border text-foreground hover:bg-accent hover:text-accent-foreground h-8 px-3 text-xs rounded-md"
        title="Visual Flow Editor"
        aria-label="Open Visual Flow Editor"
        data-testid="flow-open-visual-editor"
      >
        <Map class="w-4 h-4" />
      </button>
      <button
        onclick={() => (showAddFlow = true)}
        class="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-xs rounded-md flex items-center"
        data-testid="flow-open-add-modal"
      >
        <Plus class="w-4 h-4 mr-1" />
        Add Flow
      </button>
    </div>
  </div>

  {#if flowControls.length === 0}
    <div class="text-center py-8">
      <p class="text-muted-foreground">No flow controls defined</p>
      <p class="text-xs text-muted-foreground/60 mt-2">
        Add flow controls to create conditional logic, loops, and branching
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each flowControls as flow}
        <div
          class="bg-muted/50 p-3 rounded-md border border-border"
          data-testid={`flow-card-${flow.id}`}
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-foreground">
                  {#if flow.type === 'skip'}<CornerDownRight class="w-5 h-5" />
                  {:else if flow.type === 'branch'}<GitBranch class="w-5 h-5" />
                  {:else if flow.type === 'loop'}<Repeat class="w-5 h-5" />
                  {:else if flow.type === 'terminate'}<Square class="w-5 h-5" />
                  {:else}<HelpCircle class="w-5 h-5" />
                  {/if}
                </span>
                <span class="text-sm font-medium text-foreground capitalize">
                  {flow.type}
                </span>
              </div>

              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-muted-foreground"
                    >Condition:</span
                  >
                  <code class="text-xs bg-muted px-2 py-1 rounded font-mono">{flow.condition}</code>
                </div>

                {#if flow.target}
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground"
                      >Target:</span
                    >
                    <span class="text-xs text-foreground">{getTargetLabel(flow.target)}</span>
                  </div>
                {/if}

                {#if flow.iterations}
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground"
                      >Iterations:</span
                    >
                    <span class="text-xs text-foreground">{flow.iterations}</span>
                  </div>
                {/if}
              </div>

              {#if validateFlow(flow).length > 0}
                <div
                  class="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
                  data-testid={`flow-validation-${flow.id}`}
                >
                  {validateFlow(flow).join(' ')}
                </div>
              {/if}
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
                class="p-1 hover:bg-accent hover:text-accent-foreground rounded"
                title="Edit"
                aria-label="Edit Flow"
              >
                <Pencil class="w-4 h-4" />
              </button>
              <button
                onclick={() => handleDeleteFlow(flow.id)}
                class="p-1 hover:bg-destructive/10 rounded text-destructive"
                title="Delete"
                aria-label="Delete Flow"
              >
                <Trash2 class="w-4 h-4" />
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
    <div class="fixed inset-0 bg-black/50" aria-hidden="true"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      onclick={() => {
        showAddFlow = false;
        editingFlow = null;
        resetForm();
      }}
      data-testid="flow-add-modal-overlay"
    >
      <div
        class="bg-card rounded-[var(--radius)] shadow-lg border border-border relative max-w-md w-full p-6"
        onclick={(e) => e.stopPropagation()}
        data-testid="flow-add-modal"
      >
        <h3 class="text-base font-semibold text-foreground mb-4">
          {editingFlow ? 'Edit' : 'Add'} Flow Control
        </h3>

        <div class="space-y-4">
          <!-- Flow Type -->
          <div>
            <label
              for="flow-type"
              class="text-sm font-medium text-foreground mb-2 flex items-center gap-1"
            >
              Type <HelpTip helpKey="flowControl.branch" />
            </label>
            <select
              id="flow-type"
              bind:value={newFlow.type}
              class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary"
              disabled={editingFlow !== null}
              data-testid="flow-type-select"
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
              class="text-sm font-medium text-foreground mb-2 flex items-center gap-1"
            >
              Condition <HelpTip helpKey="flowControl.conditions" />
            </label>
            <input
              id="flow-condition"
              type="text"
              bind:value={newFlow.condition}
              placeholder="e.g., age >= 18 && consent === true"
              class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary font-mono text-sm"
              data-testid="flow-condition-input"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Use variable names and JavaScript expressions
            </p>
          </div>

          <!-- Target (for skip/branch) -->
          {#if newFlow.type === 'skip' || newFlow.type === 'branch'}
            <div>
              <label
                for="flow-target"
                class="text-sm font-medium text-foreground mb-2 block"
              >
                Target
              </label>
              <select
                id="flow-target"
                bind:value={newFlow.target}
                class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary"
                data-testid="flow-target-select"
              >
                <option value="">Select target...</option>
                {#each availableTargets as target}
                  <option value={target.id}>{target.label}</option>
                {/each}
              </select>
              {#if newFlow.target}
                <p class="mt-1 text-xs text-muted-foreground">
                  Selected: {getTargetLabel(newFlow.target)}
                </p>
              {/if}
            </div>
          {/if}

          <!-- Iterations (for loops) -->
          {#if newFlow.type === 'loop'}
            <div>
              <label
                for="flow-iterations"
                class="text-sm font-medium text-foreground mb-2 block"
              >
                Max Iterations
              </label>
              <input
                id="flow-iterations"
                type="number"
                bind:value={newFlow.iterations}
                min="1"
                max="100"
                class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary"
                data-testid="flow-iterations-input"
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
            class="border border-border text-foreground hover:bg-accent h-8 px-3 text-xs rounded-md"
            data-testid="flow-cancel-button"
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
            disabled={!newFlow.condition ||
              ((newFlow.type === 'skip' || newFlow.type === 'branch') && !newFlow.target) ||
              (newFlow.type === 'loop' && (!newFlow.iterations || newFlow.iterations < 1))}
            class="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-xs rounded-md disabled:opacity-50"
            data-testid="flow-save-button"
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
  <div class="fixed inset-0 bg-black/50" aria-hidden="true"></div>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
    <div
      class="fixed inset-4 bg-card rounded-[var(--radius)] shadow-lg border border-border flex flex-col pointer-events-auto"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between p-4 border-b border-border">
        <h3 class="text-lg font-semibold text-foreground">
          Flow Control Visual Editor
        </h3>
        <button
          onclick={() => (showFlowEditor = false)}
          class="p-2 hover:bg-accent hover:text-accent-foreground rounded-md"
          aria-label="Close editor"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="flex-1 overflow-hidden">
        <FlowControlEditor {flowControls} onUpdate={handleFlowUpdate} />
      </div>
    </div>
  </div>
{/if}
