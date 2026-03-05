<script lang="ts">
  import { X } from 'lucide-svelte';
  import { browser } from '$app/environment';

  interface Props {
    open?: boolean;
    onclose?: () => void;
  }

  let { open = false, onclose }: Props = $props();

  const isMac = $derived(browser ? navigator.platform.toUpperCase().includes('MAC') : false);
  const mod = $derived(isMac ? '\u2318' : 'Ctrl');

  interface Shortcut {
    description: string;
    keys: string[];
  }

  interface ShortcutGroup {
    title: string;
    shortcuts: Shortcut[];
  }

  const groups: ShortcutGroup[] = $derived([
    {
      title: 'General',
      shortcuts: [
        { description: 'Save', keys: [mod, 'S'] },
        { description: 'Toggle Preview', keys: [mod, 'P'] },
        { description: 'Command Palette', keys: [mod, 'K'] },
        { description: 'Keyboard Shortcuts', keys: ['?'] },
      ],
    },
    {
      title: 'Editing',
      shortcuts: [
        { description: 'Undo', keys: [mod, 'Z'] },
        { description: 'Redo', keys: [mod, 'Shift', 'Z'] },
        { description: 'Duplicate Selected', keys: [mod, 'D'] },
        { description: 'Delete Selected', keys: ['Delete'] },
        { description: 'Add Question', keys: [mod, 'Shift', 'A'] },
        { description: 'Copy Question', keys: [mod, 'C'] },
        { description: 'Paste Question', keys: [mod, 'V'] },
      ],
    },
    {
      title: 'Navigation',
      shortcuts: [
        { description: 'Move Question Up', keys: ['Alt', '\u2191'] },
        { description: 'Move Question Down', keys: ['Alt', '\u2193'] },
        { description: 'Close / Deselect', keys: ['Escape'] },
      ],
    },
    {
      title: 'Actions',
      shortcuts: [
        { description: 'Publish', keys: [mod, 'Shift', 'Enter'] },
      ],
    },
  ]);

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      onclose?.();
    }
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose?.();
    }
  }

  let dialogEl = $state<HTMLDivElement>();

  $effect(() => {
    if (open && dialogEl) {
      requestAnimationFrame(() => {
        dialogEl?.querySelector<HTMLElement>('button')?.focus();
      });
    }
  });

  $effect(() => {
    if (browser) {
      document.body.style.overflow = open ? 'hidden' : '';
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-50"
    role="dialog"
    aria-modal="true"
    aria-label="Keyboard Shortcuts"
    data-testid="keyboard-shortcuts-dialog"
  >
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/[var(--backdrop-opacity,0.5)] backdrop-blur-sm"
      onclick={handleBackdrop}
      onkeydown={(e) => e.key === 'Enter' && handleBackdrop(e as unknown as MouseEvent)}
      role="button"
      tabindex="-1"
      aria-label="Close dialog"
    ></div>

    <!-- Dialog -->
    <div class="fixed inset-0 z-10 flex items-center justify-center p-4">
      <div
        bind:this={dialogEl}
        class="w-full max-w-lg rounded-lg border border-border bg-[hsl(var(--layer-surface))] shadow-xl"
        data-testid="keyboard-shortcuts-content"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 class="text-base font-semibold text-foreground">Keyboard Shortcuts</h2>
          <button
            type="button"
            class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onclick={() => onclose?.()}
            aria-label="Close"
            data-testid="keyboard-shortcuts-close"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="max-h-[70vh] overflow-auto px-5 py-4">
          {#each groups as group, gi (group.title)}
            {#if gi > 0}
              <div class="my-3 border-t border-border"></div>
            {/if}
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h3>
            <div class="flex flex-col gap-1.5">
              {#each group.shortcuts as shortcut (shortcut.description)}
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-foreground">{shortcut.description}</span>
                  <div class="flex items-center gap-1">
                    {#each shortcut.keys as key, ki (ki)}
                      {#if ki > 0}
                        <span class="text-xs text-muted-foreground">+</span>
                      {/if}
                      <kbd
                        class="rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground"
                      >
                        {key}
                      </kbd>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
