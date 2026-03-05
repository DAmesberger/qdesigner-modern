<script lang="ts">
  import type { Snippet } from 'svelte';

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
                <svg class="h-4 w-4 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                  {#if sortKey === column.key}
                    {#if sortDirection === 'asc'}
                      <path fill-rule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clip-rule="evenodd" />
                    {:else}
                      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                    {/if}
                  {:else}
                    <path fill-rule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clip-rule="evenodd" />
                  {/if}
                </svg>
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
