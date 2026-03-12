<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    noPadding?: boolean;
    interactive?: boolean;
    class?: string;
    children: Snippet;
    onclick?: (e: MouseEvent) => void;
    onkeydown?: (e: KeyboardEvent) => void;
    [key: string]: any;
  }

  let {
    noPadding = false,
    interactive = false,
    class: className = '',
    children,
    onclick,
    onkeydown,
    ...restProps
  }: Props = $props();
</script>

{#if interactive}
  <button
    class="overflow-hidden rounded-lg bg-card border border-border shadow transition-shadow hover:shadow-md {className} w-full text-left"
    {onclick}
    {onkeydown}
    {...restProps}
  >
    {#if !noPadding}
      <div class="px-4 py-5 sm:p-6">
        {@render children()}
      </div>
    {:else}
      {@render children()}
    {/if}
  </button>
{:else}
  <div
    class="overflow-hidden rounded-lg bg-card border border-border shadow {className}"
    {...restProps}
  >
    {#if !noPadding}
      <div class="px-4 py-5 sm:p-6">
        {@render children()}
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
{/if}