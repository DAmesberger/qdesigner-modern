<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { toast } from '$lib/stores/toast';

  export let isOpen = false;

  let searchQuery = '';
  let selectedIndex = 0;
  let searchInput: HTMLInputElement;
  let filteredCommands: Command[] = [];

  interface Command {
    id: string;
    title: string;
    description?: string;
    category: string;
    icon?: string;
    shortcut?: string;
    action: () => void | Promise<void>;
    keywords?: string[];
  }

  // Define all available commands
  const commands: Command[] = [
    // Navigation
    {
      id: 'go-dashboard',
      title: 'Go to Dashboard',
      category: 'Navigation',
      icon: 'home',
      action: () => goto('/dashboard'),
      keywords: ['home', 'main'],
    },
    {
      id: 'go-designer',
      title: 'Go to Designer',
      category: 'Navigation',
      icon: 'pencil',
      action: () => goto('/designer'),
      keywords: ['edit', 'create'],
    },
    {
      id: 'go-settings',
      title: 'Go to Settings',
      category: 'Navigation',
      icon: 'cog',
      action: () => goto('/settings'),
      keywords: ['preferences', 'config'],
    },

    // Designer Actions
    {
      id: 'new-questionnaire',
      title: 'New Questionnaire',
      category: 'Designer',
      icon: 'plus',
      shortcut: 'Ctrl+N',
      action: () => {
        designerStore.importQuestionnaire(createEmptyQuestionnaire());
        toast.success('Created new questionnaire');
      },
      keywords: ['create', 'blank'],
    },
    {
      id: 'save-questionnaire',
      title: 'Save Questionnaire',
      category: 'Designer',
      icon: 'save',
      shortcut: 'Ctrl+S',
      action: async () => {
        await designerStore.saveQuestionnaire();
      },
      keywords: ['persist', 'store'],
    },
    {
      id: 'add-page',
      title: 'Add New Page',
      category: 'Designer',
      icon: 'document-add',
      action: () => {
        designerStore.addPage();
        toast.success('Added new page');
      },
      keywords: ['create page', 'new page'],
    },
    {
      id: 'validate-questionnaire',
      title: 'Validate Questionnaire',
      category: 'Designer',
      icon: 'check-circle',
      action: () => {
        designerStore.validate();
        const state = designerStore.getState();
        if (state.validationErrors.length === 0) {
          toast.success('Questionnaire is valid');
        } else {
          toast.error(`Found ${state.validationErrors.length} validation errors`);
        }
      },
      keywords: ['check', 'verify', 'test'],
    },

    // View Options
    {
      id: 'toggle-preview',
      title: 'Toggle Preview',
      category: 'View',
      icon: 'eye',
      shortcut: 'Ctrl+P',
      action: () => {
        designerStore.togglePreview();
      },
      keywords: ['show', 'hide', 'preview'],
    },
    {
      id: 'toggle-fullscreen',
      title: 'Toggle Fullscreen',
      category: 'View',
      icon: 'arrows-expand',
      shortcut: 'F11',
      action: () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      },
      keywords: ['full', 'screen', 'maximize'],
    },

    // Edit Actions
    {
      id: 'undo',
      title: 'Undo',
      category: 'Edit',
      icon: 'arrow-uturn-left',
      shortcut: 'Ctrl+Z',
      action: () => designerStore.undo(),
      keywords: ['revert', 'back'],
    },
    {
      id: 'redo',
      title: 'Redo',
      category: 'Edit',
      icon: 'arrow-uturn-right',
      shortcut: 'Ctrl+Shift+Z',
      action: () => designerStore.redo(),
      keywords: ['forward', 'restore'],
    },

    // Help
    {
      id: 'keyboard-shortcuts',
      title: 'Keyboard Shortcuts',
      category: 'Help',
      icon: 'keyboard',
      action: () => {
        // This would open a keyboard shortcuts modal
        toast.info('Keyboard shortcuts modal would open here');
      },
      keywords: ['keys', 'hotkeys', 'shortcuts'],
    },
    {
      id: 'documentation',
      title: 'Documentation',
      category: 'Help',
      icon: 'book-open',
      action: () => {
        window.open('https://docs.qdesigner.com', '_blank');
      },
      keywords: ['docs', 'help', 'guide'],
    },
  ];

  // Filter commands based on search query
  $: {
    if (!searchQuery.trim()) {
      filteredCommands = commands;
    } else {
      const query = searchQuery.toLowerCase();
      filteredCommands = commands.filter((cmd) => {
        const searchTargets = [
          cmd.title.toLowerCase(),
          cmd.description?.toLowerCase() || '',
          cmd.category.toLowerCase(),
          ...(cmd.keywords || []),
        ];
        return searchTargets.some((target) => target.includes(query));
      });
    }
    // Reset selection when results change
    selectedIndex = 0;
  }

  // Group commands by category
  $: groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category]!.push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>
  );

  // Handle keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
        scrollToSelected();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        scrollToSelected();
        break;
      case 'Enter':
        e.preventDefault();
        const selectedCommand = filteredCommands[selectedIndex];
        if (selectedCommand) {
          executeCommand(selectedCommand);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  function scrollToSelected() {
    const element = document.querySelector(`[data-command-index="${selectedIndex}"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function executeCommand(command: Command) {
    close();
    try {
      await command.action();
    } catch (error) {
      console.error('Command execution failed:', error as Error);
      toast.error('Command failed to execute');
    }
  }

  function close() {
    isOpen = false;
    searchQuery = '';
    selectedIndex = 0;
  }

  // Focus input when opened
  $: if (isOpen && searchInput) {
    searchInput.focus();
  }

  // Global keyboard shortcut
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      isOpen = !isOpen;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleGlobalKeydown);
  });

  function createEmptyQuestionnaire() {
    return {
      id: `q_${Date.now()}`,
      name: 'New Questionnaire',
      description: '',
      version: '1',
      created: new Date(),
      modified: new Date(),
      pages: [],
      questions: [],
      variables: [],
      flow: [],
      settings: {},
    };
  }

  function getIcon(iconName: string) {
    // Map icon names to SVG paths
    const icons: Record<string, string> = {
      home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
      pencil:
        'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
      cog: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      plus: 'M12 4v16m8-8H4',
      save: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2',
      'document-add':
        'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'check-circle': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
      'arrows-expand':
        'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4',
      'arrow-uturn-left': 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
      'arrow-uturn-right': 'M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3',
      keyboard: 'M2 12h20M2 12l9-9m-9 9l9 9m11-9l-9-9m9 9l-9 9',
      'book-open':
        'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    };

    return icons[iconName] || '';
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 z-50 bg-black bg-opacity-50"
    transition:fade={{ duration: 150 }}
    onclick={close}
    aria-label="Close command palette"
  ></button>

  <!-- Command Palette -->
  <div
    class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl z-50"
    transition:fly={{ y: -20, duration: 200 }}
  >
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
      <!-- Search Input -->
      <div class="border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center px-4">
          <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            bind:this={searchInput}
            bind:value={searchQuery}
            onkeydown={handleKeydown}
            type="text"
            placeholder="Type a command or search..."
            class="flex-1 px-3 py-4 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none"
          />
          <kbd
            class="hidden sm:inline-block px-2 py-1 text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 rounded"
          >
            ESC
          </kbd>
        </div>
      </div>

      <!-- Commands List -->
      <div class="max-h-96 overflow-y-auto">
        {#if filteredCommands.length === 0}
          <div class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            No commands found for "{searchQuery}"
          </div>
        {:else}
          <div class="py-2">
            {#each Object.entries(groupedCommands) as [category, categoryCommands], categoryIndex}
              <div>
                <div
                  class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {category}
                </div>
                {#each categoryCommands as command, commandIndex}
                  {@const globalIndex = filteredCommands.indexOf(command)}
                  <button
                    data-command-index={globalIndex}
                    onclick={() => executeCommand(command)}
                    onmouseenter={() => (selectedIndex = globalIndex)}
                    class="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    class:bg-gray-100={selectedIndex === globalIndex}
                    class:dark:bg-gray-700={selectedIndex === globalIndex}
                  >
                    <div class="flex items-center gap-3">
                      {#if command.icon}
                        <svg
                          class="w-5 h-5 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d={getIcon(command.icon)}
                          />
                        </svg>
                      {/if}
                      <div class="text-left">
                        <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {command.title}
                        </div>
                        {#if command.description}
                          <div class="text-xs text-gray-500 dark:text-gray-400">
                            {command.description}
                          </div>
                        {/if}
                      </div>
                    </div>
                    {#if command.shortcut}
                      <kbd
                        class="hidden sm:inline-block px-2 py-1 text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 rounded"
                      >
                        {command.shortcut}
                      </kbd>
                    {/if}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
      >
        <div class="flex items-center gap-4">
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↑↓</kbd>
            Navigate
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↵</kbd>
            Select
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">ESC</kbd>
            Close
          </span>
        </div>
        <span>
          {filteredCommands.length} command{filteredCommands.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  </div>
{/if}
