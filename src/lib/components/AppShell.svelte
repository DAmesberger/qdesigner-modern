<script lang="ts">
  import { page } from '$app/stores';
  import { supabase } from '$lib/services/supabase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  
  let user: any = null;
  let userMenuOpen = false;
  let profileImageUrl = '';
  let sidebarOpen = false;
  let sidebarCollapsed = false;
  
  onMount(() => {
    // Load sidebar state from localStorage
    const savedCollapsed = localStorage.getItem('app-sidebar-collapsed');
    if (savedCollapsed === 'true') {
      sidebarCollapsed = true;
    }
    
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        user = authUser;
        // Generate avatar from email
        profileImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser.email || '')}&background=6366f1&color=fff`;
      }
    });
  });
  
  async function handleSignOut() {
    await supabase.auth.signOut();
    goto('/login');
  }
  
  function toggleSidebarCollapse() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('app-sidebar-collapsed', String(sidebarCollapsed));
  }
  
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Designer', href: '/designer', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { name: 'Admin', href: '/admin', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { name: 'Test', href: '/fillout', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  ];
  
  $: currentPath = $page.url.pathname;
  
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

<div class="h-screen flex overflow-hidden">
  <!-- Mobile sidebar backdrop -->
  {#if sidebarOpen}
    <div class="fixed inset-0 z-50 bg-gray-900/80 lg:hidden" on:click={() => sidebarOpen = false}></div>
  {/if}

  <!-- Mobile sidebar -->
  <div class="mobile-sidebar fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl lg:hidden transform transition-transform duration-300 ease-in-out {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
    <div class="flex h-16 items-center justify-between px-4 border-b border-gray-200">
      <div class="flex items-center gap-2">
        <svg class="h-8 w-auto text-indigo-600" viewBox="0 0 32 32" fill="currentColor">
          <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 4c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm0 20c-3.866 0-7.3-1.955-9.333-4.93C8.416 18.895 11.816 18 16 18s7.584.895 9.333 3.07C23.3 24.045 19.866 26 16 26z"/>
        </svg>
        <span class="text-lg font-semibold">QDesigner</span>
      </div>
      <button
        type="button"
        class="p-2 text-gray-500 hover:text-gray-700"
        on:click={() => sidebarOpen = false}
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

  <!-- Desktop sidebar -->
  <div class="hidden lg:flex lg:flex-col transition-all duration-300 {sidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200">
      <div class="flex h-16 items-center justify-between px-4 border-b border-gray-200">
        {#if !sidebarCollapsed}
          <div class="flex items-center gap-2">
            <svg class="h-8 w-auto text-indigo-600" viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 4c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm0 20c-3.866 0-7.3-1.955-9.333-4.93C8.416 18.895 11.816 18 16 18s7.584.895 9.333 3.07C23.3 24.045 19.866 26 16 26z"/>
            </svg>
            <span class="text-lg font-semibold">QDesigner</span>
          </div>
        {:else}
          <svg class="h-8 w-auto text-indigo-600 mx-auto" viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 4c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm0 20c-3.866 0-7.3-1.955-9.333-4.93C8.416 18.895 11.816 18 16 18s7.584.895 9.333 3.07C23.3 24.045 19.866 26 16 26z"/>
          </svg>
        {/if}
        <button
          on:click={toggleSidebarCollapse}
          class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg class="h-5 w-5 transition-transform duration-300 {sidebarCollapsed ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <nav class="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {#each navigation as item}
          <a
            href={item.href}
            class="group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors {currentPath.startsWith(item.href) ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}"
            title={sidebarCollapsed ? item.name : ''}
          >
            <svg class="h-5 w-5 {currentPath.startsWith(item.href) ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'} {sidebarCollapsed ? 'mx-auto' : 'mr-3'}" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
            </svg>
            {#if !sidebarCollapsed}
              <span>{item.name}</span>
            {/if}
          </a>
        {/each}
      </nav>
      <div class="border-t border-gray-200 p-4">
        {#if !sidebarCollapsed}
          <div class="flex items-center">
            <img
              class="h-8 w-8 rounded-full"
              src={profileImageUrl}
              alt="Profile"
            />
            <div class="ml-3 flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-700 truncate">{user?.email || 'Loading...'}</p>
            </div>
          </div>
        {:else}
          <img
            class="h-8 w-8 rounded-full mx-auto"
            src={profileImageUrl}
            alt="Profile"
          />
        {/if}
      </div>
    </div>

  <!-- Main content area -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Top bar -->
    <header class="bg-white border-b border-gray-200 h-16">
      <div class="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <button
            type="button"
            class="sidebar-toggle p-2 text-gray-500 hover:text-gray-700 lg:hidden"
            on:click={() => sidebarOpen = true}
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          
          <div class="flex-1"></div>
          
          <div class="flex items-center gap-4">
            <!-- Notifications -->
            <button type="button" class="p-2 text-gray-400 hover:text-gray-500">
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </button>

            <!-- User menu -->
            <div class="relative user-menu">
              <button
                type="button"
                class="flex items-center p-2 text-sm rounded-md hover:bg-gray-100"
                on:click={() => userMenuOpen = !userMenuOpen}
              >
                <img
                  class="h-8 w-8 rounded-full"
                  src={profileImageUrl}
                  alt="Profile"
                />
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
    <main class="flex-1 overflow-auto p-6">
      <slot />
    </main>
  </div>
</div>