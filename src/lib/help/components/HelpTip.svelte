<script lang="ts">
  import { HelpCircle } from 'lucide-svelte';
  import type { Placement } from '@floating-ui/dom';
  import Popover from './Popover.svelte';
  import { helpRegistry } from '../content/registry';

  interface Props {
    helpKey: string;
    placement?: Placement;
    size?: 'sm' | 'md';
  }

  let { helpKey, placement = 'top', size = 'sm' }: Props = $props();

  let open = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);

  const entry = $derived(helpRegistry.resolve(helpKey));
  const iconSize = $derived(size === 'sm' ? 14 : 18);

  function toggle() {
    open = !open;
  }
</script>

{#if entry}
  <button
    bind:this={anchor}
    type="button"
    class="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
    onclick={toggle}
    aria-label="Help: {entry.title}"
    title={entry.title}
  >
    <HelpCircle class="shrink-0" style="width: {iconSize}px; height: {iconSize}px;" />
  </button>

  <Popover reference={anchor} {open} {placement} onclose={() => (open = false)}>
    {#snippet children()}
      <div class="max-w-[280px]">
        <p class="font-medium text-foreground text-xs mb-1">{entry.title}</p>
        <p class="text-muted-foreground text-xs leading-relaxed">{entry.description}</p>
        {#if entry.related && entry.related.length > 0}
          <div class="mt-2 pt-2 border-t border-border">
            <p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Related</p>
            <div class="flex flex-wrap gap-1">
              {#each entry.related as relatedKey}
                {@const relatedEntry = helpRegistry.resolve(relatedKey)}
                {#if relatedEntry}
                  <span class="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                    {relatedEntry.title}
                  </span>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/snippet}
  </Popover>
{/if}
