<script lang="ts">
  import { Plus } from 'lucide-svelte';

  interface Props {
    title: string;
    description: string;
    icon?: string;
    buttonText?: string;
    onAction?: () => void;
    dashed?: boolean;
  }

  let {
    title,
    description,
    icon = 'M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
    buttonText,
    onAction,
    dashed = false,
  }: Props = $props();
</script>

{#if dashed}
  <button
    type="button"
    class="relative block w-full rounded-lg border-2 border-dashed border-border p-12 text-center hover:border-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    onclick={onAction}
  >
    <svg class="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={icon} />
    </svg>
    <span class="mt-2 block text-sm font-semibold text-foreground">{title}</span>
    {#if description}
      <p class="mt-1 text-sm text-muted-foreground">{description}</p>
    {/if}
  </button>
{:else}
  <div class="text-center">
    <svg class="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={icon} />
    </svg>
    <h3 class="mt-2 text-sm font-semibold text-foreground">{title}</h3>
    <p class="mt-1 text-sm text-muted-foreground">{description}</p>
    {#if buttonText && onAction}
      <div class="mt-6">
        <button
          type="button"
          class="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onclick={onAction}
        >
          <Plus size={20} class="-ml-0.5 mr-1.5" aria-hidden="true" />
          {buttonText}
        </button>
      </div>
    {/if}
  </div>
{/if}