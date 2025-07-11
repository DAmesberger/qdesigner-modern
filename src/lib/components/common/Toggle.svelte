<script lang="ts">
  export let checked = false;
  export let disabled = false;
  export let label: string | undefined = undefined;
</script>

<label class="inline-flex items-center {disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
  <div class="group relative inline-flex h-6 w-11 shrink-0 rounded-full bg-gray-200 p-0.5 transition-colors duration-200 ease-in-out {checked ? 'bg-indigo-600' : ''} {disabled ? '' : 'focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2'}">
    <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {checked ? 'translate-x-5' : 'translate-x-0'}"></span>
    <input
      type="checkbox"
      class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      bind:checked
      {disabled}
      on:change
    />
  </div>
  {#if label}
    <span class="ml-3 text-sm font-medium text-gray-900">{label}</span>
  {/if}
</label>