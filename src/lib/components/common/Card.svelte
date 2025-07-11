<script lang="ts">
  export let noPadding = false;
  export let interactive = false;
</script>

<div 
  class="overflow-hidden rounded-lg bg-white shadow {interactive ? 'transition-shadow hover:shadow-md' : ''} {$$props.class || ''}"
  on:click
  on:keydown
  role={interactive ? 'button' : undefined}
  tabindex={interactive ? 0 : undefined}
>
  {#if !noPadding}
    <div class="px-4 py-5 sm:p-6">
      <slot />
    </div>
  {:else}
    <slot />
  {/if}
</div>