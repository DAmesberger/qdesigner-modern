<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { QuotaGroup, QuotaDefinition } from '$lib/shared';
  import { generateId } from '$lib/shared';
  import { Plus, Trash2, Target, X, ChevronDown, ChevronRight } from 'lucide-svelte';

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  let localGroups = $state<QuotaGroup[]>([]);
  let expandedGroups = $state<Set<string>>(new Set());

  $effect(() => {
    if (open) {
      const groups = designerStore.questionnaire.settings.quotas ?? [];
      localGroups = groups.map((g) => ({
        ...g,
        quotas: g.quotas.map((q) => ({ ...q })),
      }));
      expandedGroups = new Set(groups.map((g) => g.id));
    }
  });

  function addGroup() {
    const id = generateId();
    localGroups = [
      ...localGroups,
      {
        id,
        name: `Quota Group ${localGroups.length + 1}`,
        quotas: [],
        logic: 'independent',
        variables: [],
      },
    ];
    expandedGroups = new Set([...expandedGroups, id]);
  }

  function removeGroup(index: number) {
    const group = localGroups[index];
    if (group) {
      expandedGroups.delete(group.id);
      expandedGroups = new Set(expandedGroups);
    }
    localGroups = localGroups.filter((_, i) => i !== index);
  }

  function toggleGroup(id: string) {
    if (expandedGroups.has(id)) {
      expandedGroups.delete(id);
    } else {
      expandedGroups.add(id);
    }
    expandedGroups = new Set(expandedGroups);
  }

  function addQuota(groupIndex: number) {
    localGroups = localGroups.map((g, i) => {
      if (i !== groupIndex) return g;
      return {
        ...g,
        quotas: [
          ...g.quotas,
          {
            id: generateId(),
            name: `Quota ${g.quotas.length + 1}`,
            target: 50,
            condition: 'true',
            overQuotaAction: 'terminate' as const,
            overQuotaMessage: 'This study has reached its target number of participants.',
            enabled: true,
          },
        ],
      };
    });
  }

  function removeQuota(groupIndex: number, quotaIndex: number) {
    localGroups = localGroups.map((g, i) => {
      if (i !== groupIndex) return g;
      return {
        ...g,
        quotas: g.quotas.filter((_, qi) => qi !== quotaIndex),
      };
    });
  }

  function updateGroup(index: number, field: keyof QuotaGroup, value: unknown) {
    localGroups = localGroups.map((g, i) => (i === index ? { ...g, [field]: value } : g));
  }

  function updateQuota(
    groupIndex: number,
    quotaIndex: number,
    field: keyof QuotaDefinition,
    value: unknown
  ) {
    localGroups = localGroups.map((g, gi) => {
      if (gi !== groupIndex) return g;
      return {
        ...g,
        quotas: g.quotas.map((q, qi) => (qi === quotaIndex ? { ...q, [field]: value } : q)),
      };
    });
  }

  function save() {
    const groups = localGroups.filter((g) => g.quotas.length > 0);

    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        quotas: groups.length > 0 ? groups : undefined,
      },
    });

    open = false;
  }

  function cancel() {
    open = false;
  }

  const totalQuotas = $derived(localGroups.reduce((sum, g) => sum + g.quotas.length, 0));
</script>

{#if open}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-layer-modal rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-border"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <div class="flex items-center gap-2">
          <Target class="w-5 h-5 text-primary" />
          <h3 class="text-lg font-semibold text-foreground">Quota Management</h3>
          {#if totalQuotas > 0}
            <span class="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded-full">
              {totalQuotas} quota{totalQuotas !== 1 ? 's' : ''}
            </span>
          {/if}
        </div>
        <button
          onclick={cancel}
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-6 space-y-4">
        <p class="text-xs text-muted-foreground">
          Set participation caps per condition or demographic. When a quota is full, respondents
          matching that condition are routed according to the over-quota action.
        </p>

        <!-- Quota Groups -->
        {#each localGroups as group, groupIndex (group.id)}
          <div class="border border-border rounded-lg overflow-hidden">
            <!-- Group header -->
            <div class="flex items-center gap-2 px-4 py-3 bg-accent/30">
              <button
                onclick={() => toggleGroup(group.id)}
                class="p-0.5 rounded hover:bg-accent transition-colors"
                aria-label="Toggle group"
              >
                {#if expandedGroups.has(group.id)}
                  <ChevronDown class="w-4 h-4 text-muted-foreground" />
                {:else}
                  <ChevronRight class="w-4 h-4 text-muted-foreground" />
                {/if}
              </button>

              <input
                type="text"
                value={group.name}
                oninput={(e) => updateGroup(groupIndex, 'name', e.currentTarget.value)}
                class="flex-1 bg-transparent text-sm font-medium text-foreground outline-none border-b border-transparent focus:border-primary"
                placeholder="Group name"
              />

              <select
                value={group.logic}
                onchange={(e) => updateGroup(groupIndex, 'logic', e.currentTarget.value)}
                class="text-xs px-2 py-1 border border-border rounded bg-background text-foreground"
              >
                <option value="independent">Independent</option>
                <option value="cross">Cross-quota</option>
              </select>

              <button
                onclick={() => removeGroup(groupIndex)}
                class="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                aria-label="Remove group"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Group content -->
            {#if expandedGroups.has(group.id)}
              <div class="px-4 py-3 space-y-3">
                {#if group.quotas.length === 0}
                  <p class="text-xs text-muted-foreground italic text-center py-2">
                    No quotas in this group. Add one below.
                  </p>
                {:else}
                  {#each group.quotas as quota, quotaIndex (quota.id)}
                    <div class="border border-border rounded-md p-3 space-y-2 bg-background">
                      <div class="flex items-center gap-2">
                        <input
                          type="text"
                          value={quota.name}
                          oninput={(e) =>
                            updateQuota(groupIndex, quotaIndex, 'name', e.currentTarget.value)}
                          class="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
                          placeholder="Quota name"
                        />

                        <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={quota.enabled}
                            onchange={(e) =>
                              updateQuota(
                                groupIndex,
                                quotaIndex,
                                'enabled',
                                e.currentTarget.checked
                              )}
                            class="rounded border-border"
                          />
                          Enabled
                        </label>

                        <button
                          onclick={() => removeQuota(groupIndex, quotaIndex)}
                          class="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                          aria-label="Remove quota"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div class="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            for="quota-target-{quota.id}"
                            class="block text-xs text-muted-foreground mb-0.5"
                          >
                            Target (n)
                          </label>
                          <input
                            id="quota-target-{quota.id}"
                            type="number"
                            min="1"
                            value={quota.target}
                            oninput={(e) =>
                              updateQuota(
                                groupIndex,
                                quotaIndex,
                                'target',
                                parseInt(e.currentTarget.value) || 1
                              )}
                            class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
                          />
                        </div>

                        <div>
                          <label
                            for="quota-action-{quota.id}"
                            class="block text-xs text-muted-foreground mb-0.5"
                          >
                            Over-quota action
                          </label>
                          <select
                            id="quota-action-{quota.id}"
                            value={quota.overQuotaAction}
                            onchange={(e) =>
                              updateQuota(
                                groupIndex,
                                quotaIndex,
                                'overQuotaAction',
                                e.currentTarget.value
                              )}
                            class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
                          >
                            <option value="terminate">Terminate</option>
                            <option value="redirect">Redirect</option>
                            <option value="skip-to-end">Skip to end</option>
                            <option value="continue">Continue (flag only)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label
                          for="quota-condition-{quota.id}"
                          class="block text-xs text-muted-foreground mb-0.5"
                        >
                          Condition (formula)
                        </label>
                        <input
                          id="quota-condition-{quota.id}"
                          type="text"
                          value={quota.condition}
                          oninput={(e) =>
                            updateQuota(
                              groupIndex,
                              quotaIndex,
                              'condition',
                              e.currentTarget.value
                            )}
                          class="w-full px-2 py-1 text-sm font-mono border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
                          placeholder='e.g., gender == "female" or age >= 18'
                        />
                        <p class="text-[10px] text-muted-foreground mt-0.5">
                          Use "true" for a catch-all quota, or variable comparisons like
                          <code class="bg-accent px-1 rounded">age &gt;= 18</code>
                        </p>
                      </div>

                      {#if quota.overQuotaAction === 'redirect'}
                        <div>
                          <label
                            for="quota-redirect-{quota.id}"
                            class="block text-xs text-muted-foreground mb-0.5"
                          >
                            Redirect URL
                          </label>
                          <input
                            id="quota-redirect-{quota.id}"
                            type="url"
                            value={quota.overQuotaRedirectUrl ?? ''}
                            oninput={(e) =>
                              updateQuota(
                                groupIndex,
                                quotaIndex,
                                'overQuotaRedirectUrl',
                                e.currentTarget.value
                              )}
                            class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
                            placeholder="https://..."
                          />
                        </div>
                      {/if}

                      {#if quota.overQuotaAction === 'terminate' || quota.overQuotaAction === 'skip-to-end'}
                        <div>
                          <label
                            for="quota-message-{quota.id}"
                            class="block text-xs text-muted-foreground mb-0.5"
                          >
                            Over-quota message
                          </label>
                          <textarea
                            id="quota-message-{quota.id}"
                            value={quota.overQuotaMessage ?? ''}
                            oninput={(e) =>
                              updateQuota(
                                groupIndex,
                                quotaIndex,
                                'overQuotaMessage',
                                e.currentTarget.value
                              )}
                            rows="2"
                            class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary resize-none"
                            placeholder="Message shown to over-quota participants"
                          ></textarea>
                        </div>
                      {/if}

                      <!-- Progress bar -->
                      {#if quota.current !== undefined && quota.current > 0}
                        <div>
                          <div class="flex justify-between text-xs text-muted-foreground mb-0.5">
                            <span>Progress</span>
                            <span>{quota.current} / {quota.target}</span>
                          </div>
                          <div class="w-full h-2 bg-accent rounded-full overflow-hidden">
                            <div
                              class="h-full transition-all duration-300 rounded-full {quota.current >= quota.target
                                ? 'bg-emerald-500'
                                : 'bg-primary'}"
                              style="width: {Math.min(100, (quota.current / quota.target) * 100)}%"
                            ></div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                {/if}

                <button
                  onclick={() => addQuota(groupIndex)}
                  class="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-primary hover:text-primary/80 border border-dashed border-border rounded hover:border-primary/50 transition-colors"
                >
                  <Plus class="w-3.5 h-3.5" /> Add Quota
                </button>
              </div>
            {/if}
          </div>
        {/each}

        <button
          onclick={addGroup}
          class="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-primary hover:text-primary/80 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors"
        >
          <Plus class="w-4 h-4" /> Add Quota Group
        </button>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 px-6 py-4 border-t border-border">
        <button
          onclick={cancel}
          class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={save}
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          data-testid="quota-save"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
