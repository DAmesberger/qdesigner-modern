<script lang="ts">
  import type { FilterOperator, FilterRule, FilterGroup, FilterQuery } from '../types/filter';
  import { X } from 'lucide-svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';

  interface Props {
    fields: { key: string; label: string; type: 'number' | 'text' | 'date' }[];
    query?: FilterQuery;
    onQueryChange?: (query: FilterQuery) => void;
  }

  let {
    fields,
    query: initialQuery,
    onQueryChange,
  }: Props = $props();

  let query = $state<FilterQuery>({
    groups: [createGroup()],
    logic: 'AND',
  });

  $effect(() => {
    query = initialQuery ?? {
      groups: [createGroup()],
      logic: 'AND',
    };
  });

  const OPERATORS: { value: FilterOperator; label: string }[] = [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '!=' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'gte', label: '>=' },
    { value: 'lte', label: '<=' },
    { value: 'between', label: 'Between' },
    { value: 'in', label: 'In' },
  ];

  function createRule(): FilterRule {
    return {
      id: crypto.randomUUID(),
      field: fields[0]?.key ?? '',
      operator: 'eq',
      value: '',
    };
  }

  function createGroup(): FilterGroup {
    return {
      id: crypto.randomUUID(),
      logic: 'AND',
      rules: [createRule()],
    };
  }

  function addRule(groupId: string) {
    query.groups = query.groups.map(g =>
      g.id === groupId
        ? { ...g, rules: [...g.rules, createRule()] }
        : g
    );
    emitChange();
  }

  function removeRule(groupId: string, ruleId: string) {
    query.groups = query.groups.map(g =>
      g.id === groupId
        ? { ...g, rules: g.rules.filter(r => r.id !== ruleId) }
        : g
    ).filter(g => g.rules.length > 0);
    emitChange();
  }

  function addGroup() {
    query.groups = [...query.groups, createGroup()];
    emitChange();
  }

  function removeGroup(groupId: string) {
    query.groups = query.groups.filter(g => g.id !== groupId);
    if (query.groups.length === 0) {
      query.groups = [createGroup()];
    }
    emitChange();
  }

  function updateRule(groupId: string, ruleId: string, updates: Partial<FilterRule>) {
    query.groups = query.groups.map(g =>
      g.id === groupId
        ? {
            ...g,
            rules: g.rules.map(r =>
              r.id === ruleId ? { ...r, ...updates } : r
            ),
          }
        : g
    );
    emitChange();
  }

  function toggleGroupLogic(groupId: string) {
    query.groups = query.groups.map(g =>
      g.id === groupId
        ? { ...g, logic: g.logic === 'AND' ? 'OR' : 'AND' }
        : g
    );
    emitChange();
  }

  function toggleTopLogic() {
    query.logic = query.logic === 'AND' ? 'OR' : 'AND';
    emitChange();
  }

  function emitChange() {
    onQueryChange?.(query);
  }
</script>

<div class="space-y-3">
  {#each query.groups as group, gi (group.id)}
    {#if gi > 0}
      <button
        type="button"
        class="mx-auto block px-3 py-1 text-xs font-medium rounded-full
          bg-muted text-muted-foreground
          hover:bg-accent transition-colors"
        onclick={toggleTopLogic}
      >
        {query.logic}
      </button>
    {/if}

    <div class="border border-border rounded-lg p-3 space-y-2">
      {#each group.rules as rule, ri (rule.id)}
        {#if ri > 0}
          <button
            type="button"
            class="mx-auto block px-2 py-0.5 text-xs font-medium rounded-full
              bg-primary/10 text-primary
              hover:bg-primary/20 transition-colors"
            onclick={() => toggleGroupLogic(group.id)}
          >
            {group.logic}
          </button>
        {/if}

        <div class="flex items-center gap-2">
          <!-- Field -->
          <Select
            class="flex-1 text-sm"
            value={rule.field}
            onchange={(e) => updateRule(group.id, rule.id, { field: e.currentTarget.value })}
            placeholder=""
          >
            {#each fields as field}
              <option value={field.key}>{field.label}</option>
            {/each}
          </Select>

          <!-- Operator -->
          <Select
            class="w-24 text-sm"
            value={rule.operator}
            onchange={(e) => updateRule(group.id, rule.id, { operator: e.currentTarget.value as FilterOperator })}
            placeholder=""
          >
            {#each OPERATORS as op}
              <option value={op.value}>{op.label}</option>
            {/each}
          </Select>

          <!-- Value -->
          <Input
            type="text"
            class="flex-1 text-sm"
            value={rule.value}
            placeholder="Value"
            oninput={(e) => updateRule(group.id, rule.id, { value: e.currentTarget.value })}
          />

          {#if rule.operator === 'between'}
            <Input
              type="text"
              class="flex-1 text-sm"
              value={rule.value2 ?? ''}
              placeholder="Value 2"
              oninput={(e) => updateRule(group.id, rule.id, { value2: e.currentTarget.value })}
            />
          {/if}

          <!-- Remove rule -->
          <button
            type="button"
            class="p-1 text-muted-foreground hover:text-destructive transition-colors"
            onclick={() => removeRule(group.id, rule.id)}
            title="Remove rule"
          >
            <X size={16} />
          </button>
        </div>
      {/each}

      <div class="flex items-center gap-2 pt-1">
        <button
          type="button"
          class="text-xs text-primary hover:underline"
          onclick={() => addRule(group.id)}
        >
          + Add rule
        </button>
        <span class="text-muted-foreground">|</span>
        <button
          type="button"
          class="text-xs text-destructive hover:underline"
          onclick={() => removeGroup(group.id)}
        >
          Remove group
        </button>
      </div>
    </div>
  {/each}

  <button
    type="button"
    class="text-sm text-primary hover:underline"
    onclick={addGroup}
  >
    + Add filter group
  </button>
</div>
