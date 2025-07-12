<script lang="ts">
  export let checked = false;
  export let disabled = false;
  export let id: string | undefined = undefined;
  export let name: string | undefined = undefined;
  export let value: string | undefined = undefined;
  export let label: string = '';
  export let description: string = '';
  
  $: checkboxClasses = `
    h-4 w-4 rounded border-border text-primary 
    focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background
    ${disabled ? 'bg-muted cursor-not-allowed opacity-50' : 'cursor-pointer'}
  `;
</script>

<div class="relative flex items-start">
  <div class="flex h-6 items-center">
    <input
      {id}
      {name}
      {value}
      {disabled}
      type="checkbox"
      bind:checked
      class={checkboxClasses}
      on:change
    />
  </div>
  {#if label || description}
    <div class="ml-3 text-sm leading-6">
      {#if label}
        <label for={id} class="font-medium text-foreground {disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}">
          {label}
        </label>
      {/if}
      {#if description}
        <p class="text-muted-foreground">{description}</p>
      {/if}
    </div>
  {/if}
</div>