<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/shared/types/types/services/supabase';
  import Button from '../../common/Button.svelte';
  
  export let user: any = null;
  
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Designer', href: '/designer', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { name: 'Admin', href: '/admin', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { name: 'Test', href: '/fillout', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  ];
  
  $: currentPath = $page.url.pathname;
  
  async function handleSignOut() {
    await supabase.auth.signOut();
    goto('/login');
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Navigation -->
  <nav class="bg-white shadow-sm border-b border-gray-200">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 justify-between">
        <div class="flex">
          <!-- Logo -->
          <div class="flex shrink-0 items-center">
            <h1 class="text-xl font-bold text-gray-900">QDesigner</h1>
          </div>
          <!-- Navigation Links -->
          <div class="hidden sm:ml-8 sm:flex sm:space-x-8">
            {#each navigation as item}
              <a
                href={item.href}
                class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors {
                  currentPath.startsWith(item.href)
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }"
              >
                <svg class="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d={item.icon} />
                </svg>
                {item.name}
              </a>
            {/each}
          </div>
        </div>
        
        <!-- Right side -->
        <div class="flex items-center space-x-4">
          {#if user}
            <span class="text-sm text-gray-700">{user.email}</span>
            <Button size="sm" variant="ghost" on:click={handleSignOut}>
              Sign out
            </Button>
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Mobile navigation -->
    <div class="sm:hidden">
      <div class="space-y-1 pb-3 pt-2">
        {#each navigation as item}
          <a
            href={item.href}
            class="block border-l-4 py-2 pl-3 pr-4 text-base font-medium transition-colors {
              currentPath.startsWith(item.href)
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
            }"
          >
            {item.name}
          </a>
        {/each}
      </div>
    </div>
  </nav>
  
  <!-- Main content -->
  <main>
    <slot />
  </main>
</div>