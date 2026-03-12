<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Home, ChevronRight } from 'lucide-svelte';

  interface Props {
    title: string;
    description?: string;
    breadcrumbs?: Array<{ name: string; href?: string }>;
    actions?: Snippet;
  }

  let {
    title,
    description = '',
    breadcrumbs = [],
    actions,
  }: Props = $props();
</script>

<div class="bg-card shadow-sm">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <!-- Breadcrumbs -->
    {#if breadcrumbs.length > 0}
      <nav class="flex py-2" aria-label="Breadcrumb">
        <ol class="flex items-center space-x-2">
          <li>
            <a href="/" class="text-muted-foreground hover:text-foreground">
              <Home size={20} class="shrink-0" aria-hidden="true" />
              <span class="sr-only">Home</span>
            </a>
          </li>
          {#each breadcrumbs as crumb, i}
            <li class="flex items-center">
              <ChevronRight size={20} class="shrink-0 text-border" aria-hidden="true" />
              {#if crumb.href && i < breadcrumbs.length - 1}
                <a href={crumb.href} class="ml-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                  {crumb.name}
                </a>
              {:else}
                <span class="ml-2 text-sm font-medium text-foreground" aria-current="page">
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
          <h1 class="text-2xl font-bold leading-7 text-foreground sm:truncate sm:text-3xl sm:tracking-tight">
            {title}
          </h1>
          {#if description}
            <p class="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          {/if}
        </div>
        <div class="mt-4 flex md:ml-4 md:mt-0">
          {#if actions}
            {@render actions()}
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
