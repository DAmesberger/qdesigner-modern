<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte';
  import {
    computePosition,
    autoUpdate,
    flip,
    shift,
    offset,
    arrow as arrowMiddleware,
    type Placement,
  } from '@floating-ui/dom';

  interface Props {
    reference: HTMLElement | null;
    open?: boolean;
    placement?: Placement;
    offset?: number;
    arrow?: boolean;
    children?: Snippet;
    onclose?: () => void;
  }

  let {
    reference,
    open = false,
    placement = 'top',
    offset: offsetValue = 8,
    arrow: showArrow = true,
    children,
    onclose,
  }: Props = $props();

  let floating = $state<HTMLDivElement | null>(null);
  let arrowEl = $state<HTMLDivElement | null>(null);
  let cleanup: (() => void) | null = null;

  function updatePosition() {
    if (!reference || !floating) return;

    const middleware = [
      offset(offsetValue),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
    ];

    if (showArrow && arrowEl) {
      middleware.push(arrowMiddleware({ element: arrowEl, padding: 4 }));
    }

    void computePosition(reference, floating, {
      placement,
      middleware,
    }).then(({ x, y, placement: finalPlacement, middlewareData }) => {
      if (!floating) return;
      Object.assign(floating.style, {
        left: `${x}px`,
        top: `${y}px`,
      });

      if (showArrow && arrowEl && middlewareData.arrow) {
        const { x: ax, y: ay } = middlewareData.arrow;
        const side = finalPlacement.split('-')[0] as string;
        const staticSide: Record<string, string> = {
          top: 'bottom',
          right: 'left',
          bottom: 'top',
          left: 'right',
        };
        Object.assign(arrowEl.style, {
          left: ax != null ? `${ax}px` : '',
          top: ay != null ? `${ay}px` : '',
          [staticSide[side] ?? 'bottom']: '-4px',
        });
      }
    });
  }

  $effect(() => {
    cleanup?.();
    cleanup = null;

    if (open && reference && floating) {
      cleanup = autoUpdate(reference, floating, updatePosition);
    }
  });

  function handleClickOutside(e: MouseEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (floating?.contains(target) || reference?.contains(target)) return;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      onclose?.();
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside, true);
  });

  onDestroy(() => {
    cleanup?.();
    document.removeEventListener('mousedown', handleClickOutside, true);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    bind:this={floating}
    class="fixed z-[45] w-max max-w-xs rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--layer-surface))] shadow-[var(--shadow-lg)] p-3 text-sm text-foreground"
    role="tooltip"
  >
    {#if children}
      {@render children()}
    {/if}
    {#if showArrow}
      <div
        bind:this={arrowEl}
        class="absolute h-2 w-2 rotate-45 bg-[hsl(var(--layer-surface))] border border-[hsl(var(--glass-border))]"
      ></div>
    {/if}
  </div>
{/if}
