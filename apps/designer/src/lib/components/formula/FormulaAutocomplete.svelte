<script lang="ts">
  import type { FormulaFunction } from '@qdesigner/scripting-engine';
  import { createEventDispatcher } from 'svelte';
  
  export let functions: FormulaFunction[] = [];
  export let selectedIndex: number = 0;
  
  const dispatch = createEventDispatcher();
  
  const categoryIcons: Record<string, string> = {
    math: '🔢',
    stat: '📊',
    text: '📝',
    date: '📅',
    logical: '🔀',
    array: '📋',
    custom: '⚡'
  };
  
  const categoryColors: Record<string, string> = {
    math: 'blue',
    stat: 'purple',
    text: 'green',
    date: 'orange',
    logical: 'red',
    array: 'indigo',
    custom: 'yellow'
  };
  
  function selectFunction(func: FormulaFunction) {
    dispatch('select', func);
  }
  
  function formatParameters(params: FormulaFunction['parameters']): string {
    return params.map(p => {
      const optional = p.optional ? '?' : '';
      return `${p.name}${optional}`;
    }).join(', ');
  }
</script>

<div class="autocomplete-list">
  {#each functions as func, index}
    <button
      class="autocomplete-item"
      class:selected={index === selectedIndex}
      on:click={() => selectFunction(func)}
      on:mouseenter={() => selectedIndex = index}
    >
      <div class="function-header">
        <span class="category-icon" title={func.category}>
          {categoryIcons[func.category] || '📌'}
        </span>
        <span class="function-name">{func.name}</span>
        <span class="function-signature">({formatParameters(func.parameters)})</span>
      </div>
      
      <div class="function-description">
        {func.description}
      </div>
      
      <div class="function-meta">
        <span class="category-badge {categoryColors[func.category] || 'gray'}">
          {func.category}
        </span>
        <span class="return-type">→ {func.returns}</span>
      </div>
      
      {#if func.examples && func.examples.length > 0}
        <div class="function-example">
          <span class="example-label">Example:</span>
          <code>{func.examples[0]}</code>
        </div>
      {/if}
    </button>
  {/each}
  
  {#if functions.length === 0}
    <div class="no-results">
      No matching functions found
    </div>
  {/if}
</div>

<style>
  .autocomplete-list {
    max-height: 400px;
    overflow-y: auto;
  }
  
  .autocomplete-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 0.75rem;
    background: white;
    border: none;
    border-bottom: 1px solid var(--color-gray-100);
    text-align: left;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .autocomplete-item:last-child {
    border-bottom: none;
  }
  
  .autocomplete-item:hover,
  .autocomplete-item.selected {
    background: var(--color-gray-50);
  }
  
  .autocomplete-item.selected {
    background: var(--color-blue-50);
  }
  
  .function-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  
  .category-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }
  
  .function-name {
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .function-signature {
    font-family: 'Courier New', monospace;
    font-size: 0.75rem;
    color: var(--color-gray-600);
  }
  
  .function-description {
    font-size: 0.75rem;
    color: var(--color-gray-700);
    margin-bottom: 0.5rem;
    line-height: 1.4;
  }
  
  .function-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
  }
  
  .category-badge {
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
  
  .category-badge.blue {
    background: var(--color-blue-100);
    color: var(--color-blue-700);
  }
  
  .category-badge.purple {
    background: var(--color-purple-100);
    color: var(--color-purple-700);
  }
  
  .category-badge.green {
    background: var(--color-green-100);
    color: var(--color-green-700);
  }
  
  .category-badge.orange {
    background: var(--color-orange-100);
    color: var(--color-orange-700);
  }
  
  .category-badge.red {
    background: var(--color-red-100);
    color: var(--color-red-700);
  }
  
  .category-badge.indigo {
    background: var(--color-indigo-100);
    color: var(--color-indigo-700);
  }
  
  .category-badge.yellow {
    background: var(--color-yellow-100);
    color: var(--color-yellow-700);
  }
  
  .category-badge.gray {
    background: var(--color-gray-100);
    color: var(--color-gray-700);
  }
  
  .return-type {
    color: var(--color-gray-500);
  }
  
  .function-example {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
  }
  
  .example-label {
    color: var(--color-gray-600);
  }
  
  .function-example code {
    font-family: 'Courier New', monospace;
    background: var(--color-gray-100);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    color: var(--color-gray-800);
  }
  
  .no-results {
    padding: 1.5rem;
    text-align: center;
    color: var(--color-gray-500);
    font-size: 0.875rem;
  }
</style>