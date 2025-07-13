<script lang="ts">
  import { selectedItem } from '../stores/designerStore';
  import { createItemHandler } from '../utils/itemHandlers';
  
  $: handler = createItemHandler($selectedItem);
  $: properties = handler?.getProperties() || {};
  $: settings = handler?.getSettings() || {};
  $: canHaveSettings = handler?.canHaveSettings() || false;
  $: validationErrors = handler?.validate() || [];
  
  function updateSetting(key: string, value: any) {
    if (handler && handler.updateSettings) {
      handler.updateSettings({ [key]: value });
    }
  }
</script>

{#if handler}
  <div class="item-properties-editor">
    <!-- Header with icon and name -->
    <div class="flex items-center gap-2 p-4 border-b">
      <iconify-icon icon={handler.getIcon()} class="text-xl" />
      <h3 class="font-semibold">{handler.getDisplayName()}</h3>
    </div>
    
    <!-- Validation errors -->
    {#if validationErrors.length > 0}
      <div class="p-4 bg-red-50 border-b border-red-100">
        <h4 class="text-sm font-medium text-red-800 mb-1">Validation Issues:</h4>
        <ul class="text-sm text-red-600 space-y-1">
          {#each validationErrors as error}
            <li class="flex items-start gap-1">
              <iconify-icon icon="mdi:alert-circle" class="mt-0.5" />
              {error}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    
    <!-- Properties section -->
    <div class="p-4 space-y-4">
      <div>
        <h4 class="text-sm font-medium text-gray-700 mb-2">Properties</h4>
        <div class="space-y-2">
          {#each Object.entries(properties) as [key, value]}
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">{key}:</span>
              <span class="text-gray-900 font-mono">{value}</span>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Settings section (only if item supports settings) -->
      {#if canHaveSettings}
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-2">Settings</h4>
          <div class="space-y-3">
            {#each Object.entries(settings) as [key, value]}
              <div>
                <label class="block text-sm text-gray-600 mb-1">{key}</label>
                <input
                  type="text"
                  value={value}
                  on:change={(e) => updateSetting(key, (e.target as HTMLInputElement).value)}
                  class="w-full px-3 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="p-8 text-center text-gray-500">
    <iconify-icon icon="mdi:cursor-default-click-outline" class="text-4xl mb-2" />
    <p>Select an item to view its properties</p>
  </div>
{/if}

<style>
  .item-properties-editor {
    @apply bg-white h-full overflow-y-auto;
  }
</style>