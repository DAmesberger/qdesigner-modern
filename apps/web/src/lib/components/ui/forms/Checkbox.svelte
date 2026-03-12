<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    name?: string;
    value?: string;
    label?: string;
    description?: string;
    onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    id = undefined,
    name = undefined,
    value = undefined,
    label = '',
    description = '',
    onchange,
  }: Props = $props();

  let checkboxClasses = $derived(`
    h-4 w-4 rounded border-border text-primary
    focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background
    ${disabled ? 'bg-muted cursor-not-allowed opacity-50' : 'cursor-pointer'}
  `);
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
      {onchange}
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
