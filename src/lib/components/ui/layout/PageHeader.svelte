<script lang="ts">
  export let title: string;
  export let description: string = '';
  export let breadcrumbs: Array<{ name: string; href?: string }> = [];
</script>

<div class="bg-white shadow-sm">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <!-- Breadcrumbs -->
    {#if breadcrumbs.length > 0}
      <nav class="flex py-2" aria-label="Breadcrumb">
        <ol class="flex items-center space-x-2">
          <li>
            <a href="/" class="text-gray-400 hover:text-gray-500">
              <svg class="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clip-rule="evenodd" />
              </svg>
              <span class="sr-only">Home</span>
            </a>
          </li>
          {#each breadcrumbs as crumb, i}
            <li class="flex items-center">
              <svg class="h-5 w-5 shrink-0 text-gray-300" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
              </svg>
              {#if crumb.href && i < breadcrumbs.length - 1}
                <a href={crumb.href} class="ml-2 text-sm font-medium text-gray-500 hover:text-gray-700">
                  {crumb.name}
                </a>
              {:else}
                <span class="ml-2 text-sm font-medium text-gray-900" aria-current="page">
                  {crumb.name}
                </span>
              {/if}
            </li>
          {/each}
        </ol>
      </nav>
    {/if}
    
    <!-- Page heading -->
    <div class="py-6">
      <div class="md:flex md:items-center md:justify-between">
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            {title}
          </h1>
          {#if description}
            <p class="mt-1 text-sm text-gray-500">
              {description}
            </p>
          {/if}
        </div>
        <div class="mt-4 flex md:ml-4 md:mt-0">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </div>
</div>