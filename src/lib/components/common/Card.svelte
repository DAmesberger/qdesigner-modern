<script lang="ts">
  export let noPadding = false;
  export let interactive = false;
</script>

{#if interactive}
  <button 
    class="overflow-hidden rounded-lg bg-white shadow transition-shadow hover:shadow-md {$$props.class || ''} w-full text-left"
    on:click
    on:keydown
  >
    {#if !noPadding}
      <div class="px-4 py-5 sm:p-6">
        <slot />
      </div>
    {:else}
      <slot />
    {/if}
  </button>
{:else}
  <div 
    class="overflow-hidden rounded-lg bg-white shadow {$$props.class || ''}"
  >
    {#if !noPadding}
      <div class="px-4 py-5 sm:p-6">
        <slot />
      </div>
    {:else}
      <slot />
    {/if}
  </div>
{/if}