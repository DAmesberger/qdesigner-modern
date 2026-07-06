<script lang="ts">
  import type { Page } from '$lib/shared';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    /** The page being edited. */
    pageItem: Page;
    /** Writes a single page property through the shell's designer store. */
    onUpdate: (property: string, value: unknown) => void;
  }

  let { pageItem, onUpdate }: Props = $props();
</script>

<div class="p-4 space-y-4">
  <div>
    <label
      for="page-name-{pageItem.id}"
      class="block text-sm font-medium text-foreground mb-1">Page Name</label
    >
    <input
      id="page-name-{pageItem.id}"
      type="text"
      value={pageItem.name || ''}
      oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
        onUpdate('name', e.currentTarget.value)}
      class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
      placeholder="Page name..."
    />
  </div>

  <div>
    <label
      for="page-id-{pageItem.id}"
      class="block text-sm font-medium text-foreground mb-1">Page ID</label
    >
    <input
      id="page-id-{pageItem.id}"
      type="text"
      value={pageItem.id}
      disabled
      class="w-full px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground"
    />
  </div>

  <div>
    <label
      for="page-layout-{pageItem.id}"
      class="block text-sm font-medium text-foreground mb-1">Layout</label
    >
    <Select
      id="page-layout-{pageItem.id}"
      value={pageItem.layout?.type || 'vertical'}
      onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
        onUpdate('layout', {
          ...pageItem.layout,
          type: e.currentTarget.value,
        })}
      placeholder=""
    >
      <option value="vertical">Vertical</option>
      <option value="horizontal">Horizontal</option>
      <option value="grid">Grid</option>
    </Select>
  </div>

  <!-- Page time limit (E-FLOW-5) -->
  <div class="border-t pt-3">
    <span class="block text-sm font-medium text-foreground mb-2">Page time limit</span>
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label
          for="page-timelimit-{pageItem.id}"
          class="block text-xs text-muted-foreground mb-1">Seconds (0 = none)</label
        >
        <input
          id="page-timelimit-{pageItem.id}"
          type="number"
          min="0"
          step="1"
          value={pageItem.settings?.timeLimit ? pageItem.settings.timeLimit / 1000 : 0}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
            const secs = Number(e.currentTarget.value);
            const ms = Number.isFinite(secs) && secs > 0 ? Math.round(secs * 1000) : undefined;
            onUpdate('settings', { ...pageItem.settings, timeLimit: ms });
          }}
          class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
          data-testid="page-timelimit-input"
        />
      </div>
      <div>
        <label
          for="page-timelimit-action-{pageItem.id}"
          class="block text-xs text-muted-foreground mb-1">On timeout</label
        >
        <Select
          id="page-timelimit-action-{pageItem.id}"
          value={pageItem.settings?.onTimeLimit || 'auto-advance'}
          onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
            onUpdate('settings', {
              ...pageItem.settings,
              onTimeLimit: e.currentTarget.value as 'auto-advance' | 'terminate',
            })}
          placeholder=""
        >
          <option value="auto-advance">Auto-advance</option>
          <option value="terminate">Terminate</option>
        </Select>
      </div>
    </div>
  </div>

  <div>
    <span class="block text-sm font-medium text-foreground mb-1">Questions</span>
    <p class="text-sm text-muted-foreground">
      This page contains {pageItem.blocks?.reduce(
        (sum: number, block: any) => sum + (block.questions?.length || 0),
        0
      ) || 0} questions
    </p>
  </div>
</div>
