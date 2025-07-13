<script lang="ts">
  import { designerStore, selectedItem } from '$lib/features/designer/stores/designerStore';
  import type { Question, Page, Variable } from '$lib/shared';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import StyleEditor from './StyleEditor.svelte';
  import ScriptEditor from './ScriptEditor.svelte';
  import { defaultTheme } from '$lib/shared/types/theme';
  
  let activeTab: 'properties' | 'style' | 'script' = 'properties';
  let theme = defaultTheme; // In real app, this would come from store
  
  $: showScriptTab = $selectedItem && $designerStore.selectedItemType === 'question';
  
  function handleThemeUpdate(event: CustomEvent) {
    const { path, value } = event.detail;
    // Update theme in store
    // For now, just update local theme
    theme = JSON.parse(JSON.stringify(theme));
    let obj = theme as any;
    for (let i = 0; i < path.length - 1; i++) {
      obj = obj[path[i]];
    }
    obj[path[path.length - 1]] = value;
  }
  
  function handleScriptUpdate(script: string) {
    if ($selectedItem && $designerStore.selectedItemType === 'question') {
      designerStore.updateQuestion($selectedItem.id, {
        settings: {
          ...$selectedItem.settings,
          script
        }
      });
    }
  }
</script>

<div class="properties-panel h-full flex flex-col">
  <!-- Tabs -->
  <div class="flex border-b border-gray-200">
    <button
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
      class:bg-white={activeTab === 'properties'}
      class:text-gray-900={activeTab === 'properties'}
      class:text-gray-600={activeTab !== 'properties'}
      class:border-b-2={activeTab === 'properties'}
      class:border-blue-500={activeTab === 'properties'}
      on:click={() => activeTab = 'properties'}
    >
      Properties
    </button>
    <button
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
      class:bg-white={activeTab === 'style'}
      class:text-gray-900={activeTab === 'style'}
      class:text-gray-600={activeTab !== 'style'}
      class:border-b-2={activeTab === 'style'}
      class:border-blue-500={activeTab === 'style'}
      on:click={() => activeTab = 'style'}
    >
      Style
    </button>
    {#if showScriptTab}
      <button
        class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
        class:bg-white={activeTab === 'script'}
        class:text-gray-900={activeTab === 'script'}
        class:text-gray-600={activeTab !== 'script'}
        class:border-b-2={activeTab === 'script'}
        class:border-blue-500={activeTab === 'script'}
        on:click={() => activeTab = 'script'}
      >
        Script
      </button>
    {/if}
  </div>
  
  <!-- Tab Content -->
  <div class="flex-1 overflow-hidden">
    {#if activeTab === 'properties'}
      <PropertiesPanel />
    {:else if activeTab === 'style'}
      <StyleEditor
        {theme}
        selectedElement={$designerStore.selectedItemType || 'global'}
        on:update={handleThemeUpdate}
      />
    {:else if activeTab === 'script' && $selectedItem && $designerStore.selectedItemType === 'question'}
      <ScriptEditor
        question={$selectedItem}
        onUpdate={handleScriptUpdate}
      />
    {/if}
  </div>
</div>

<style>
  .properties-panel {
    background: white;
  }
</style>