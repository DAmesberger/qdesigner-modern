<script lang="ts">
  export let title: string;
  export let description: string;
  export let icon: string = 'M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z';
  export let buttonText: string | undefined = undefined;
  export let onAction: (() => void) | undefined = undefined;
  export let dashed = false;
</script>

{#if dashed}
  <button
    type="button"
    class="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
    on:click={onAction}
  >
    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={icon} />
    </svg>
    <span class="mt-2 block text-sm font-semibold text-gray-900">{title}</span>
    {#if description}
      <p class="mt-1 text-sm text-gray-500">{description}</p>
    {/if}
  </button>
{:else}
  <div class="text-center">
    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={icon} />
    </svg>
    <h3 class="mt-2 text-sm font-semibold text-gray-900">{title}</h3>
    <p class="mt-1 text-sm text-gray-500">{description}</p>
    {#if buttonText && onAction}
      <div class="mt-6">
        <button
          type="button"
          class="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          on:click={onAction}
        >
          <svg class="-ml-0.5 mr-1.5 h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          {buttonText}
        </button>
      </div>
    {/if}
  </div>
{/if}