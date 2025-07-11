<script lang="ts">
  export let tabs: Array<{ id: string; label: string }>;
  export let activeTab: string;
  export let onChange: (tabId: string) => void = () => {};
</script>

<div>
  <!-- Mobile dropdown -->
  <div class="sm:hidden">
    <label for="tabs" class="sr-only">Select a tab</label>
    <select
      id="tabs"
      name="tabs"
      class="block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
      value={activeTab}
      on:change={(e) => onChange(e.currentTarget.value)}
    >
      {#each tabs as tab}
        <option value={tab.id}>{tab.label}</option>
      {/each}
    </select>
  </div>
  
  <!-- Desktop tabs -->
  <div class="hidden sm:block">
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        {#each tabs as tab}
          <button
            type="button"
            class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            on:click={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>
    </div>
  </div>
</div>