<script lang="ts">
  export let label: string = '';
  export let error: string = '';
  export let hint: string = '';
  export let required = false;
  export let id: string | undefined = undefined;
</script>

<div class="space-y-1">
  {#if $$slots.label}
    <label for={id} class="block text-sm font-medium leading-6 text-gray-900">
      <slot name="label" />
    </label>
  {:else if label}
    <label for={id} class="block text-sm font-medium leading-6 text-gray-900">
      {label}
      {#if required}
        <span class="text-red-500 ml-1">*</span>
      {/if}
    </label>
  {/if}
  
  <div>
    <slot />
  </div>
  
  {#if error}
    <p class="text-sm text-red-600" id="{id}-error">
      {error}
    </p>
  {:else if hint}
    <p class="text-sm text-gray-500" id="{id}-hint">
      {hint}
    </p>
  {/if}
</div>