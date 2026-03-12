<script lang="ts">
  interface Props {
    tabs: Array<{ id: string; label: string }>;
    activeTab: string;
    onChange?: (tabId: string) => void;
  }

  let {
    tabs,
    activeTab,
    onChange = () => {},
  }: Props = $props();
</script>

<div>
  <!-- Mobile dropdown -->
  <div class="sm:hidden">
    <label for="tabs" class="sr-only">Select a tab</label>
    <select
      id="tabs"
      name="tabs"
      class="block w-full rounded-md border-border focus:border-primary focus:ring-primary"
      value={activeTab}
      onchange={(e) => onChange(e.currentTarget.value)}
    >
      {#each tabs as tab}
        <option value={tab.id}>{tab.label}</option>
      {/each}
    </select>
  </div>

  <!-- Desktop tabs -->
  <div class="hidden sm:block">
    <div class="border-b border-border">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        {#each tabs as tab}
          <button
            type="button"
            class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            }"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onclick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>
    </div>
  </div>
</div>
