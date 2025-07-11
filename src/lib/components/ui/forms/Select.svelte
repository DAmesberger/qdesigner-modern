<script lang="ts">
  export let value = '';
  export let options: Array<{ value: string; label: string }> = [];
  export let placeholder = 'Select an option';
  export let disabled = false;
  export let error = false;
  export let id: string | undefined = undefined;
  export let name: string | undefined = undefined;
  
  $: selectClasses = `
    block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 shadow-sm 
    ring-1 ring-inset focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
    ${error 
      ? 'ring-red-300 focus:ring-red-500' 
      : 'ring-gray-300 focus:ring-indigo-600'
    }
    ${disabled ? 'bg-gray-50 text-gray-500' : ''}
  `;
</script>

<div class="relative">
  <select
    {id}
    {name}
    {disabled}
    bind:value
    class={selectClasses}
    on:change
    on:blur
  >
    {#if placeholder}
      <option value="" disabled selected={!value}>
        {placeholder}
      </option>
    {/if}
    {#each options as option}
      <option value={option.value}>
        {option.label}
      </option>
    {/each}
  </select>
  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
    <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clip-rule="evenodd" />
    </svg>
  </div>
</div>