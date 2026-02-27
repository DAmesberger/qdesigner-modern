<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';

  interface Props {
    isOpen?: boolean;
    onclose?: () => void;
  }

  interface CommandItem {
    id: string;
    title: string;
    shortcut?: string;
    run: () => void | Promise<void>;
  }

  let { isOpen = false, onclose }: Props = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let searchInput = $state<HTMLInputElement | undefined>();

  const commands = $derived<CommandItem[]>([
    {
      id: 'add-text-input',
      title: 'Add Text Input Question',
      shortcut: 'T',
      run: () => {
        const target = designerStore.currentBlock?.id || designerStore.currentPage?.id;
        if (target) designerStore.addQuestion(target, 'text-input');
      },
    },
    {
      id: 'add-multiple-choice',
      title: 'Add Multiple Choice Question',
      shortcut: 'M',
      run: () => {
        const target = designerStore.currentBlock?.id || designerStore.currentPage?.id;
        if (target) designerStore.addQuestion(target, 'multiple-choice');
      },
    },
    {
      id: 'add-reaction-time',
      title: 'Add Reaction Time Question',
      shortcut: 'R',
      run: () => {
        const target = designerStore.currentBlock?.id || designerStore.currentPage?.id;
        if (target) designerStore.addQuestion(target, 'reaction-time');
      },
    },
    {
      id: 'add-page',
      title: 'Add Page',
      shortcut: 'P',
      run: () => designerStore.addPage(),
    },
    {
      id: 'step-add',
      title: 'Go to Add Step',
      shortcut: 'Ctrl+1',
      run: () => {
        designerStore.setActiveLeftTab('questions');
        designerStore.toggleDrawer('left', true);
      },
    },
    {
      id: 'step-configure',
      title: 'Go to Configure Step',
      shortcut: 'Ctrl+2',
      run: () => {
        const firstQuestion = designerStore.currentBlockQuestions[0];
        if (firstQuestion) {
          designerStore.selectItem(firstQuestion.id, 'question');
        }
        designerStore.toggleDrawer('right', true);
      },
    },
    {
      id: 'step-preview',
      title: 'Go to Preview Step',
      shortcut: 'Ctrl+3',
      run: () => designerStore.togglePreview(true),
    },
    {
      id: 'save',
      title: 'Save Questionnaire',
      shortcut: 'Ctrl+S',
      run: async () => {
        await designerStore.saveQuestionnaire();
      },
    },
    {
      id: 'publish',
      title: 'Publish Questionnaire',
      shortcut: 'Ctrl+Shift+P',
      run: async () => {
        await designerStore.publishQuestionnaire();
      },
    },
    {
      id: 'preview',
      title: 'Toggle Preview',
      shortcut: 'Ctrl+P',
      run: () => designerStore.togglePreview(),
    },
    {
      id: 'duplicate-selected',
      title: 'Duplicate Selected Item',
      shortcut: 'Ctrl+D',
      run: () => designerStore.duplicateSelected(),
    },
    {
      id: 'delete-selected',
      title: 'Delete Selected Item',
      shortcut: 'Del',
      run: () => designerStore.deleteSelected(),
    },
    {
      id: 'switch-visual',
      title: 'Switch to Visual View',
      run: () => designerStore.setViewMode('wysiwyg'),
    },
    {
      id: 'switch-structure',
      title: 'Switch to Structure View',
      run: () => designerStore.setViewMode('structural'),
    },
  ]);

  const filtered = $derived(
    commands.filter((command) => command.title.toLowerCase().includes(query.trim().toLowerCase()))
  );

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
      class="absolute inset-0 bg-black/50"
      aria-label="Close command palette"
      onclick={closePalette}
    ></button>

    <div
      class="relative mx-auto mt-20 w-[min(680px,92vw)] rounded-xl border bg-background shadow-2xl"
    >
      <div class="border-b px-4 py-3">
        <input
          bind:this={searchInput}
          type="text"
          bind:value={query}
          data-testid="command-search"
          placeholder="Search commands..."
          class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div class="max-h-[60vh] overflow-y-auto py-1">
        {#if filtered.length === 0}
          <p class="px-4 py-6 text-sm text-muted-foreground">No matching commands.</p>
        {:else}
          {#each filtered as command, index (command.id)}
            <button
              type="button"
              class="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-accent"
              class:bg-accent={index === selectedIndex}
              data-testid={`command-${command.id}`}
              onclick={() => runCommand(command)}
            >
              <span>{command.title}</span>
              {#if command.shortcut}
                <kbd class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >{command.shortcut}</kbd
                >
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
