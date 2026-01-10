<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import { goto } from '$app/navigation';
  import { createEventDispatcher } from 'svelte';
  import theme from '$lib/theme';
  import VersionManager from '$lib/components/designer/VersionManager.svelte';
  import { theme as themeStore } from '$lib/stores/theme';

  // Props
  interface Props {
    questionnaireName: string;
    pageCount: number;
    blockCount: number;
    questionCount: number;
    viewMode: 'structural' | 'wysiwyg';
  }

  let { questionnaireName, pageCount, blockCount, questionCount, viewMode }: Props = $props();

  const dispatch = createEventDispatcher();

  let showMenu = $state(false);
  let showKeyboardShortcuts = $state(false);

  // Format save time
  let formattedSaveTime = $derived(
    designerStore.lastSaved
      ? new Date(designerStore.lastSaved).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Never'
  );

  // Keyboard shortcuts
  const shortcuts = [
    { key: 'Ctrl+S', action: 'Save' },
    { key: 'Ctrl+Z', action: 'Undo' },
    { key: 'Ctrl+Shift+Z', action: 'Redo' },
    { key: 'Ctrl+P', action: 'Preview' },
    { key: 'F11', action: 'Fullscreen' },
    { key: 'Ctrl+D', action: 'Duplicate' },
    { key: 'Delete', action: 'Delete selected' },
  ];

  function handleSave() {
    designerStore.saveQuestionnaire();
  }

  function handleLoad() {
    // TODO: Implement load functionality
    console.log('Load questionnaire');
  }

  function handleExport() {
    // TODO: Implement export functionality
    console.log('Export questionnaire');
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
</script>

<header
  class="h-14 flex items-center px-4 gap-4 {theme.semantic.bgSurface} {theme.semantic
    .borderDefault} border-b"
>
  <!-- Logo/Back Button -->
  <button
    onclick={() => {
      if (typeof window !== 'undefined') {
        window.location.href = '/dashboard';
      }
    }}
    class="flex items-center gap-2 {theme.semantic.textSecondary} {theme.semantic.interactive
      .ghost} px-2 py-1 rounded-md transition-colors"
    title="Back to Dashboard"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 19l-7-7m0 0l7-7m-7 7h18"
      />
    </svg>
    <span class="font-semibold {theme.semantic.textPrimary} hidden sm:inline">QDesigner</span>
  </button>

  <!-- Separator -->
  <div class="h-6 w-px {theme.semantic.borderDefault}"></div>

  <!-- Questionnaire Name -->
  <div class="flex-1 min-w-0">
    <h1 class="text-lg font-semibold {theme.semantic.textPrimary} truncate">
      {questionnaireName || 'Untitled Questionnaire'}
    </h1>
    <p class="text-xs {theme.semantic.textSecondary}">
      {pageCount}
      {pageCount === 1 ? 'page' : 'pages'} • {blockCount}
      {blockCount === 1 ? 'block' : 'blocks'} • {questionCount}
      {questionCount === 1 ? 'question' : 'questions'}
    </p>
  </div>

  <!-- Version Manager -->
  {#if designerStore.questionnaire.id}
    <VersionManager questionnaireId={designerStore.questionnaire.id} />
  {/if}

  <!-- Center Actions -->
  <div class="flex items-center gap-2">
    <!-- Undo/Redo -->
    <div class="flex items-center {theme.semantic.bgSubtle} rounded-md p-0.5">
      <button
        onclick={() => designerStore.undo()}
        disabled={!designerStore.canUndo}
        class="p-1.5 rounded {theme.semantic
          .bgHover} hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
          />
        </svg>
      </button>
      <button
        onclick={() => designerStore.redo()}
        disabled={!designerStore.canRedo}
        class="p-1.5 rounded {theme.semantic
          .bgHover} hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
          />
        </svg>
      </button>
    </div>

    <!-- View Mode Toggle -->
    <div class="flex items-center {theme.semantic.bgSubtle} rounded-md p-0.5">
      <button
        class="px-2 py-1 text-xs font-medium rounded transition-colors"
        class:bg-background={viewMode === 'structural'}
        class:text-foreground={viewMode === 'structural'}
        class:text-muted-foreground={viewMode !== 'structural'}
        onclick={() => dispatch('viewModeChange', 'structural')}
      >
        Structure
      </button>
      <button
        class="px-2 py-1 text-xs font-medium rounded transition-colors"
        class:bg-background={viewMode === 'wysiwyg'}
        class:text-foreground={viewMode === 'wysiwyg'}
        class:text-muted-foreground={viewMode !== 'wysiwyg'}
        onclick={() => dispatch('viewModeChange', 'wysiwyg')}
      >
        Visual
      </button>
    </div>
  </div>

  <!-- Right Actions -->
  <div class="flex items-center gap-2">
    <!-- Save Status -->
    <div class="text-xs text-muted-foreground min-w-[100px] text-right">
      {#if designerStore.isSaving}
        <span class="text-blue-600">Saving...</span>
      {:else if designerStore.saveError}
        <span class="text-red-600">Save failed</span>
      {:else}
        <span>Saved {formattedSaveTime}</span>
      {/if}
    </div>

    <!-- Theme Toggle -->
    <button
      onclick={() => themeStore.toggle()}
      class="p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
      title="Toggle theme"
    >
      {#if $themeStore === 'dark'}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      {/if}
    </button>

    <!-- Preview Button -->
    <button
      onclick={() => dispatch('togglePreview')}
      class="px-3 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
    >
      Preview
    </button>

    <!-- More Menu -->
    <div class="relative">
      <button
        onclick={() => (showMenu = !showMenu)}
        class="p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
        aria-label="More options"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {#if showMenu}
        <!-- Menu Dropdown -->
        <div
          class="absolute right-0 mt-2 w-48 bg-popover rounded-md shadow-lg ring-1 ring-border z-50"
        >
          <div class="py-1">
            <button
              onclick={handleSave}
              class="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2"
                />
              </svg>
              Save
            </button>
            <button
              onclick={handleLoad}
              class="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Load
            </button>
            <button
              onclick={handleExport}
              class="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export
            </button>
            <div class="border-t border-border"></div>
            <button
              onclick={() => designerStore.validate()}
              class="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Validate
            </button>
            <button
              onclick={toggleFullscreen}
              class="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
              Fullscreen
            </button>
            <div class="border-t border-border"></div>
            <button
              onclick={() => (showKeyboardShortcuts = true)}
              class="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              Keyboard Shortcuts
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>

<!-- Keyboard Shortcuts Modal -->
{#if showKeyboardShortcuts}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-popover rounded-lg p-6 max-w-md w-full border border-border shadow-xl">
      <h3 class="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
      <div class="space-y-2">
        {#each shortcuts as shortcut}
          <div class="flex justify-between">
            <span class="text-muted-foreground">{shortcut.action}</span>
            <kbd class="px-2 py-1 text-xs bg-muted rounded font-mono">{shortcut.key}</kbd>
          </div>
        {/each}
      </div>
      <button
        onclick={() => (showKeyboardShortcuts = false)}
        class="mt-6 w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        Close
      </button>
    </div>
  </div>
{/if}

<!-- Click outside to close menu -->
{#if showMenu}
  <button class="fixed inset-0 z-40" onclick={() => (showMenu = false)} aria-label="Close menu"
  ></button>
{/if}
