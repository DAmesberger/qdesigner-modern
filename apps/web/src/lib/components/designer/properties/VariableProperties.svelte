<script lang="ts">
  import type { Variable } from '$lib/shared';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    /** The variable being edited. */
    variableItem: Variable;
    /** Writes a single variable property through the shell's designer store. */
    onUpdate: (property: string, value: unknown) => void;
  }

  let { variableItem, onUpdate }: Props = $props();
</script>

<div class="p-4 space-y-4">
  <div>
    <label
      for="var-name-{variableItem.id}"
      class="block text-sm font-medium text-foreground mb-1">Variable Name</label
    >
    <input
      id="var-name-{variableItem.id}"
      type="text"
      value={variableItem.name}
      oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
        onUpdate('name', e.currentTarget.value)}
      class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
      placeholder="Optional internal identifier"
    />
  </div>

  <div>
    <label
      for="var-type-{variableItem.id}"
      class="block text-sm font-medium text-foreground mb-1">Type</label
    >
    <Select
      id="var-type-{variableItem.id}"
      value={variableItem.type}
      onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
        onUpdate('type', e.currentTarget.value)}
      placeholder=""
    >
      <option value="number">Number</option>
      <option value="string">Text</option>
      <option value="boolean">True/False</option>
      <option value="date">Date</option>
      <option value="time">Time</option>
      <option value="array">List</option>
      <option value="reaction_time">Reaction Time</option>
      <option value="stimulus_onset">Stimulus Onset</option>
    </Select>
  </div>

  <div>
    <label
      for="var-formula-{variableItem.id}"
      class="block text-sm font-medium text-foreground mb-1">Formula</label
    >
    <textarea
      id="var-formula-{variableItem.id}"
      value={variableItem.formula || ''}
      oninput={(e: Event & { currentTarget: HTMLTextAreaElement }) =>
        onUpdate('formula', e.currentTarget.value)}
      rows="3"
      class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary font-mono text-sm bg-background text-foreground"
      placeholder="e.g., age * 10 + reactionTime"
    ></textarea>
  </div>

  <div>
    <label
      for="var-desc-{variableItem.id}"
      class="block text-sm font-medium text-foreground mb-1">Description</label
    >
    <input
      id="var-desc-{variableItem.id}"
      type="text"
      value={variableItem.description || ''}
      oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
        onUpdate('description', e.currentTarget.value)}
      class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
      placeholder="What is this variable for?"
    />
  </div>
</div>
