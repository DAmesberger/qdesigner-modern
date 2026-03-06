<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronDown } from 'lucide-svelte';

  interface Props {
    value?: string;
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    id?: string;
    name?: string;
    class?: string;
    children?: Snippet;
    onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
    onblur?: (event: FocusEvent & { currentTarget: HTMLSelectElement }) => void;
  }

  let {
    value = $bindable(''),
    options = [],
    placeholder = 'Select an option',
    disabled = false,
    error = false,
    id = undefined,
    name = undefined,
    class: className = '',
    children,
    onchange,
    onblur,
  }: Props = $props();

  let selectClasses = $derived(`
    block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-foreground bg-background shadow-sm
    ring-1 ring-inset focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
    ${error
      ? 'ring-destructive focus:ring-destructive'
      : 'ring-border focus:ring-primary'
    }
    ${disabled ? 'bg-muted text-muted-foreground opacity-50' : ''}
    ${className}
  `);
</script>

<div class="relative">
  <select
    {id}
    {name}
    {disabled}
    bind:value
    class={selectClasses}
    {onchange}
    {onblur}
  >
    {#if placeholder}
      <option value="" disabled selected={!value}>
        {placeholder}
      </option>
    {/if}
    {#if children}
      {@render children()}
    {:else}
      {#each options as option}
        <option value={option.value}>
          {option.label}
        </option>
      {/each}
    {/if}
  </select>
  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
    <ChevronDown size={20} class="text-muted-foreground" />
  </div>
</div>
