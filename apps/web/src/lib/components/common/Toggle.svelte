<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    label = undefined,
    onchange,
  }: Props = $props();
</script>

<label class="inline-flex items-center {disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
  <div class="group relative inline-flex h-6 w-11 shrink-0 rounded-full bg-muted p-0.5 transition-colors duration-200 ease-in-out {checked ? 'bg-primary' : ''} {disabled ? '' : 'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2'}">
    <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out {checked ? 'translate-x-5' : 'translate-x-0'}"></span>
    <input
      type="checkbox"
      class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      bind:checked
      {disabled}
      {onchange}
    />
  </div>
  {#if label}
    <span class="ml-3 text-sm font-medium text-foreground">{label}</span>
  {/if}
</label>
