<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import Button from '../../common/Button.svelte';
  import { onMount } from 'svelte';
  
  export let user: any = null;
  
  let sidebarOpen = false;
  let userMenuOpen = false;
  let profileImageUrl = '';
  
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Projects', href: '/projects', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { name: 'Admin', href: '/admin', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { name: 'Test', href: '/fillout', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  ];
  
  // Check if current route needs minimal layout
  $: isDesignerRoute = $page.url.pathname.includes('/designer/');
  $: isMinimalLayout = isDesignerRoute;
  
  $: currentPath = $page.url.pathname;
  
  onMount(() => {
    if (user?.email) {
      profileImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=6366f1&color=fff`;
    }
  });
  
  async function handleSignOut() {
    await supabase.auth.signOut();
    goto('/login');
  }
  
  // Click outside handler
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu')) {
      userMenuOpen = false;
    }
    if (sidebarOpen && !target.closest('.mobile-sidebar') && !target.closest('.sidebar-toggle')) {
      sidebarOpen = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="h-screen flex overflow-hidden bg-gray-50">
  {#if !isMinimalLayout}
    <!-- Standard layout for regular pages -->
    
    <!-- Mobile sidebar backdrop -->
    {#if sidebarOpen}
      <button 
        type="button"
        class="fixed inset-0 z-50 bg-gray-900/80 lg:hidden" 
        on:click={() => sidebarOpen = false}
        aria-label="Close sidebar"
      ></button>
    {/if}
    
    <!-- Mobile sidebar -->
    <div class="mobile-sidebar fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl lg:hidden transform transition-transform duration-300 ease-in-out {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
      <div class="flex h-16 items-center justify-between px-4 border-b border-gray-200">
        <h1 class="text-xl font-bold text-gray-900">QDesigner</h1>
        <button
          type="button"
          class="p-2 text-gray-500 hover:text-gray-700"
          on:click={() => sidebarOpen = false}
          aria-label="Close sidebar"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <nav class="flex-1 px-2 py-4 space-y-1">
        {#each navigation as item}
          <a
            href={item.href}
            class="group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors {currentPath.startsWith(item.href) ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}"
            on:click={() => sidebarOpen = false}
          >
            <svg class="mr-3 h-5 w-5 {currentPath.startsWith(item.href) ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'}" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
            </svg>
            {item.name}
          </a>
        {/each}
      </nav>
    </div>
    
    <!-- Main content area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="bg-white border-b border-gray-200 h-16">
        <div class="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div class="flex items-center">
            <button
              type="button"
              class="sidebar-toggle p-2 text-gray-500 hover:text-gray-700 lg:hidden"
              on:click={() => sidebarOpen = true}
              aria-label="Open sidebar"
            >
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            
            <!-- Logo for desktop -->
            <div class="hidden lg:flex items-center">
              <h1 class="text-xl font-bold text-gray-900">QDesigner</h1>
            </div>
          </div>
          
          <!-- Desktop navigation -->
          <nav class="hidden lg:flex lg:space-x-8">
            {#each navigation as item}
              <a
                href={item.href}
                class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors {
                  currentPath.startsWith(item.href)
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }"
              >
                <svg class="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
                </svg>
                {item.name}
              </a>
            {/each}
          </nav>
          
          <!-- User menu -->
          <div class="flex items-center gap-4">
            <div class="relative user-menu">
              <button
                type="button"
                class="flex items-center p-2 text-sm rounded-md hover:bg-gray-100"
                on:click={() => userMenuOpen = !userMenuOpen}
                aria-label="User menu"
                aria-expanded={userMenuOpen}
              >
                {#if profileImageUrl}
                  <img
                    class="h-8 w-8 rounded-full"
                    src={profileImageUrl}
                    alt="Profile"
                  />
                {/if}
                <span class="hidden sm:block ml-3 text-gray-700">{user?.email || 'Loading...'}</span>
                <svg class="ml-2 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
              </button>
              
              {#if userMenuOpen}
                <div class="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                  <a href="/settings" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    Your Profile
                  </a>
                  <a href="/settings" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    Settings
                  </a>
                  <button
                    type="button"
                    class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    on:click={handleSignOut}
                  >
                    Sign out
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </header>
      
      <!-- Page content -->
      <main class="flex-1 overflow-auto">
        <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <slot />
        </div>
      </main>
    </div>
  {:else}
    <!-- Minimal layout for designer -->
    <div class="flex-1 overflow-hidden">
      <slot />
    </div>
  {/if}
</div>