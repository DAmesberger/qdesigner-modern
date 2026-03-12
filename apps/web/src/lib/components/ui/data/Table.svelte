<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-svelte';

  interface Column {
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
  }

  interface Props {
    columns?: Column[];
    data?: Array<Record<string, any>>;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
    cell?: Snippet<[{ column: Column; row: Record<string, any>; value: any }]>;
    actions?: Snippet<[{ row: Record<string, any> }]>;
    empty?: Snippet;
  }

  let {
    columns = [],
    data = [],
    sortKey = $bindable(''),
    sortDirection = $bindable('asc'),
    cell,
    actions,
    empty,
  }: Props = $props();

  function handleSort(key: string) {
    if (!columns.find(col => col.key === key)?.sortable) return;

    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = 'asc';
    }
  }

  let sortedData = $derived([...data].sort((a, b) => {
    if (!sortKey) return 0;

    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (aVal === bVal) return 0;

    const result = aVal < bVal ? -1 : 1;
    return sortDirection === 'asc' ? result : -result;
  }));
</script>

<div class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
  <table class="min-w-full divide-y divide-border">
    <thead class="bg-muted">
      <tr>
        {#each columns as column}
          <th
            scope="col"
            class="px-3 py-3.5 text-left text-sm font-semibold text-foreground {column.sortable ? 'cursor-pointer select-none' : ''}"
            style={column.width ? `width: ${column.width}` : ''}
            onclick={() => handleSort(column.key)}
          >
            <div class="flex items-center space-x-1">
              <span>{column.label}</span>
              {#if column.sortable}
                {#if sortKey === column.key}
                  {#if sortDirection === 'asc'}
                    <ChevronUp size={16} class="text-muted-foreground" />
                  {:else}
                    <ChevronDown size={16} class="text-muted-foreground" />
                  {/if}
                {:else}
                  <ArrowUpDown size={16} class="text-muted-foreground" />
                {/if}
              {/if}
            </div>
          </th>
        {/each}
        <th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-0">
          <span class="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border bg-card">
      {#each sortedData as row, i}
        <tr>
          {#each columns as column}
            <td class="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
              {#if cell}
                {@render cell({ column, row, value: row[column.key] })}
              {:else}
                {row[column.key]}
              {/if}
            </td>
          {/each}
          <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
            {#if actions}
              {@render actions({ row })}
            {/if}
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan={columns.length + 1} class="px-3 py-8 text-center text-sm text-muted-foreground">
            {#if empty}
              {@render empty()}
            {:else}
              No data available
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
