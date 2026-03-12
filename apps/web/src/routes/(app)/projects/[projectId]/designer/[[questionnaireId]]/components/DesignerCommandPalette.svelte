<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import { tourEngine } from '$lib/help/tours/TourEngine.svelte';
  import { Search } from 'lucide-svelte';

  interface Props {
    isOpen?: boolean;
    onclose?: () => void;
  }

  interface CommandItem {
    id: string;
    title: string;
    shortcut?: string;
    section?: string;
    run: () => void | Promise<void>;
  }

  let { isOpen = false, onclose }: Props = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let searchInput = $state<HTMLInputElement | undefined>();

  const commands = $derived<CommandItem[]>([
    // Add questions
    {
      id: 'add-text-input',
      title: 'Add Text Input Question',
      shortcut: 'T',
      section: 'Add',
      run: () => {
        const target = designerStore.currentBlock?.id || designerStore.currentPage?.id;
        if (target) designerStore.addQuestion(target, 'text-input');
      },
    },
    {
      id: 'add-multiple-choice',
      title: 'Add Multiple Choice Question',
      shortcut: 'M',
      section: 'Add',
      run: () => {
        const target = designerStore.currentBlock?.id || designerStore.currentPage?.id;
        if (target) designerStore.addQuestion(target, 'multiple-choice');
      },
    },
    {
      id: 'add-reaction-experiment',
      title: 'Add Reaction Experiment',
      shortcut: 'R',
      section: 'Add',
      run: () => {
        const target = designerStore.currentBlock?.id || designerStore.currentPage?.id;
        if (target) designerStore.addQuestion(target, 'reaction-experiment');
      },
    },
    {
      id: 'add-page',
      title: 'Add Page',
      shortcut: 'P',
      section: 'Add',
      run: () => designerStore.addPage(),
    },
    // Edit
    {
      id: 'undo',
      title: 'Undo',
      shortcut: 'Ctrl+Z',
      section: 'Edit',
      run: () => designerStore.undo(),
    },
    {
      id: 'redo',
      title: 'Redo',
      shortcut: 'Ctrl+Shift+Z',
      section: 'Edit',
      run: () => designerStore.redo(),
    },
    {
      id: 'duplicate-selected',
      title: 'Duplicate Selected Item',
      shortcut: 'Ctrl+D',
      section: 'Edit',
      run: () => designerStore.duplicateSelected(),
    },
    {
      id: 'delete-selected',
      title: 'Delete Selected Item',
      shortcut: 'Del',
      section: 'Edit',
      run: () => designerStore.deleteSelected(),
    },
    // View
    {
      id: 'switch-visual',
      title: 'Switch to Visual View',
      section: 'View',
      run: () => designerStore.setViewMode('wysiwyg'),
    },
    {
      id: 'switch-structure',
      title: 'Switch to Structure View',
      section: 'View',
      run: () => designerStore.setViewMode('structural'),
    },
    {
      id: 'zoom-in',
      title: 'Zoom In',
      shortcut: 'Ctrl+=',
      section: 'View',
      run: () => {
        (window as any).__designerZoom?.zoomIn();
      },
    },
    {
      id: 'zoom-out',
      title: 'Zoom Out',
      shortcut: 'Ctrl+-',
      section: 'View',
      run: () => {
        (window as any).__designerZoom?.zoomOut();
      },
    },
    {
      id: 'zoom-reset',
      title: 'Reset Zoom',
      shortcut: 'Ctrl+0',
      section: 'View',
      run: () => {
        (window as any).__designerZoom?.resetZoom();
      },
    },
    // Panels
    {
      id: 'open-structure',
      title: 'Open Structure Panel',
      section: 'Panels',
      run: () => designerStore.setPanel('structure'),
    },
    {
      id: 'open-add',
      title: 'Open Add Panel',
      section: 'Panels',
      run: () => designerStore.setPanel('add'),
    },
    {
      id: 'open-variables',
      title: 'Open Variables Panel',
      section: 'Panels',
      run: () => designerStore.setPanel('variables'),
    },
    {
      id: 'open-flow',
      title: 'Open Flow Panel',
      section: 'Panels',
      run: () => designerStore.setPanel('flow'),
    },
    // Actions
    {
      id: 'save',
      title: 'Save Questionnaire',
      shortcut: 'Ctrl+S',
      section: 'Actions',
      run: async () => {
        await designerStore.saveQuestionnaire();
      },
    },
    {
      id: 'publish',
      title: 'Publish Questionnaire',
      shortcut: 'Ctrl+Shift+Enter',
      section: 'Actions',
      run: async () => {
        await designerStore.publishQuestionnaire();
      },
    },
    {
      id: 'preview',
      title: 'Toggle Preview',
      shortcut: 'Ctrl+P',
      section: 'Actions',
      run: () => designerStore.togglePreview(),
    },
    {
      id: 'live-test',
      title: 'Run Live Test',
      section: 'Actions',
      run: () => {
        (window as any).__designerTestRunner?.show();
      },
    },
    // Help
    {
      id: 'help-getting-started',
      title: 'Getting Started Tour',
      section: 'Help',
      run: async () => {
        const mod = await import('$lib/help/tours/definitions/designerIntro');
        const tour = mod.designerIntroTour;
        if (tour) tourEngine.start(tour);
      },
    },
    {
      id: 'help-variables-tour',
      title: 'Variables Tutorial',
      section: 'Help',
      run: async () => {
        const mod = await import('$lib/help/tours/definitions/variablesTour');
        const tour = mod.variablesTour;
        if (tour) tourEngine.start(tour);
      },
    },
    {
      id: 'help-formula-reference',
      title: 'Formula Reference',
      shortcut: '?',
      section: 'Help',
      run: () => designerStore.setPanel('help'),
    },
    {
      id: 'help-keyboard-shortcuts',
      title: 'Keyboard Shortcuts',
      shortcut: 'Ctrl+/',
      section: 'Help',
      run: () => designerStore.setPanel('help'),
    },
  ]);

  const filtered = $derived(
    commands.filter((command) => command.title.toLowerCase().includes(query.trim().toLowerCase()))
  );

  // Group filtered commands by section
  const groupedCommands = $derived.by(() => {
    const groups: { section: string; commands: CommandItem[] }[] = [];
    const sectionMap = new Map<string, CommandItem[]>();

    for (const cmd of filtered) {
      const section = cmd.section || 'General';
      if (!sectionMap.has(section)) {
        sectionMap.set(section, []);
        groups.push({ section, commands: sectionMap.get(section)! });
      }
      sectionMap.get(section)!.push(cmd);
    }

    return groups;
  });

  $effect(() => {
    if (!isOpen) {
      query = '';
      selectedIndex = 0;
      return;
    }

    selectedIndex = 0;
    queueMicrotask(() => searchInput?.focus());
  });

  function closePalette() {
    query = '';
    selectedIndex = 0;
    onclose?.();
  }

  async function runCommand(command: CommandItem) {
    await command.run();
    closePalette();
  }

  async function handleKeyDown(event: KeyboardEvent) {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }

    if (filtered.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % filtered.length;
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) await runCommand(selected);
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <div class="fixed inset-0 z-50" data-testid="designer-command-palette">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 backdrop-blur-sm"
      aria-label="Close command palette"
      onclick={closePalette}
    ></button>

    <div
      class="relative mx-auto mt-20 w-[min(680px,92vw)] rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--layer-surface))] shadow-[var(--shadow-xl)]"
    >
      <div class="border-b border-border px-4 py-3 flex items-center gap-2">
        <Search class="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          bind:this={searchInput}
          type="text"
          bind:value={query}
          data-testid="command-search"
          placeholder="Type a command..."
          class="w-full bg-transparent px-1 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      <div class="max-h-[60vh] overflow-y-auto py-1">
        {#if filtered.length === 0}
          <p class="px-4 py-6 text-sm text-muted-foreground text-center">No matching commands.</p>
        {:else}
          {#each groupedCommands as group}
            <div class="px-3 pt-2 pb-1">
              <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{group.section}</span>
            </div>
            {#each group.commands as command}
              {@const globalIndex = filtered.indexOf(command)}
              <button
                type="button"
                class="flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors duration-100 hover:bg-accent {globalIndex === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'}"
                data-testid={`command-${command.id}`}
                onclick={() => runCommand(command)}
              >
                <span>{command.title}</span>
                {#if command.shortcut}
                  <kbd class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{command.shortcut}</kbd>
                {/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
