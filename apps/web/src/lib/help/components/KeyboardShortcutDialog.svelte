<script lang="ts">
  import { browser } from '$app/environment';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';

  interface Props {
    open?: boolean;
    onclose?: () => void;
  }

  let { open = $bindable(false), onclose }: Props = $props();

  function handleClose() {
    open = false;
    onclose?.();
  }

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


</script>

<Dialog bind:open={open} title="Keyboard Shortcuts" size="md" onclose={handleClose}>
  <div data-testid="keyboard-shortcuts-dialog">
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
</Dialog>
