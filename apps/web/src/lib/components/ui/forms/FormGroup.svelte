<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    error?: string;
    hint?: string;
    required?: boolean;
    id?: string;
    labelSnippet?: Snippet;
    children?: Snippet;
  }

  let {
    label = '',
    error = '',
    hint = '',
    required = false,
    id = undefined,
    labelSnippet,
    children,
  }: Props = $props();
</script>

<div class="space-y-1">
  {#if labelSnippet}
    <label for={id} class="block text-sm font-medium leading-6 text-foreground">
      {@render labelSnippet()}
    </label>
  {:else if label}
    <label for={id} class="block text-sm font-medium leading-6 text-foreground">
      {label}
      {#if required}
        <span class="text-destructive ml-1">*</span>
      {/if}
    </label>
  {/if}

  <div>
    {#if children}
      {@render children()}
    {/if}
  </div>

  {#if error}
    <p class="text-sm text-destructive" id="{id}-error">
      {error}
    </p>
  {:else if hint}
    <p class="text-sm text-muted-foreground" id="{id}-hint">
      {hint}
    </p>
  {/if}
</div>
