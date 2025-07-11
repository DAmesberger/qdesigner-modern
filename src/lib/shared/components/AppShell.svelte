<script lang="ts">
  import { page } from '$app/stores';
  import { supabase } from '$lib/shared/types/types/services/supabase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  
  let user: any = null;
  let userMenuOpen = false;
  let profileImageUrl = '';
  
  onMount(() => {
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
  
  const navigation = [
    { name: 'Designer', href: '/design', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { name: 'Questionnaires', href: '/questionnaires', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { name: 'Analytics', href: '/analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { name: 'Settings', href: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];
  
  let sidebarOpen = false;
  
  $: currentPath = $page.url.pathname;
  
  // Click outside handler
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu')) {
      userMenuOpen = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div>
  <!-- Mobile sidebar backdrop -->
  {#if sidebarOpen}
    <div class="fixed inset-0 z-50 lg:hidden">
      <div class="fixed inset-0 bg-gray-900/80" on:click={() => sidebarOpen = false}></div>
    </div>
  {/if}

  <!-- Mobile sidebar -->
  <div class="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl lg:hidden transform transition-transform duration-300 ease-in-out {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
    <div class="flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 px-6">
      <svg class="h-8 w-auto text-indigo-600" viewBox="0 0 32 32" fill="currentColor">
        <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 4c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm0 20c-3.866 0-7.3-1.955-9.333-4.93C8.416 18.895 11.816 18 16 18s7.584.895 9.333 3.07C23.3 24.045 19.866 26 16 26z"/>
      </svg>
      <span class="text-xl font-semibold">QDesigner</span>
      <button
        type="button"
        class="ml-auto -m-2.5 p-2.5"
        on:click={() => sidebarOpen = false}
      >
        <span class="sr-only">Close sidebar</span>
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <nav class="flex flex-1 flex-col px-6 pb-4">
      <ul role="list" class="flex flex-1 flex-col gap-y-1 mt-6">
        {#each navigation as item}
          <li>
            <a
              href={item.href}
              class="group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 hover:bg-gray-50 hover:text-indigo-600 {currentPath === item.href ? 'bg-gray-50 text-indigo-600' : 'text-gray-700'}"
            >
              <svg class="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
              </svg>
              {item.name}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </div>

  <!-- Desktop sidebar -->
  <div class="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
    <div class="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
      <div class="flex h-16 shrink-0 items-center gap-x-4">
        <svg class="h-8 w-auto text-indigo-600" viewBox="0 0 32 32" fill="currentColor">
          <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 4c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm0 20c-3.866 0-7.3-1.955-9.333-4.93C8.416 18.895 11.816 18 16 18s7.584.895 9.333 3.07C23.3 24.045 19.866 26 16 26z"/>
        </svg>
        <span class="text-xl font-semibold">QDesigner Modern</span>
      </div>
      <nav class="flex flex-1 flex-col">
        <ul role="list" class="flex flex-1 flex-col gap-y-1">
          {#each navigation as item}
            <li>
              <a
                href={item.href}
                class="group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 hover:bg-gray-50 hover:text-indigo-600 {currentPath === item.href ? 'bg-gray-50 text-indigo-600' : 'text-gray-700'}"
              >
                <svg class="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
                </svg>
                {item.name}
              </a>
            </li>
          {/each}
          <li class="mt-auto">
            <div class="flex items-center gap-x-3 px-2 py-2 text-sm font-semibold leading-6 text-gray-700">
              <img
                class="h-8 w-8 rounded-full bg-gray-50"
                src={profileImageUrl}
                alt="Profile"
              />
              <span class="truncate">{user?.email || 'Loading...'}</span>
            </div>
          </li>
        </ul>
      </nav>
    </div>
  </div>

  <!-- Main content area -->
  <div class="lg:pl-72">
    <!-- Top bar -->
    <div class="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <button
        type="button"
        class="-m-2.5 p-2.5 text-gray-700 lg:hidden"
        on:click={() => sidebarOpen = true}
      >
        <span class="sr-only">Open sidebar</span>
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <!-- Separator -->
      <div class="h-6 w-px bg-gray-200 lg:hidden" aria-hidden="true"></div>

      <div class="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div class="flex flex-1"></div>
        <div class="flex items-center gap-x-4 lg:gap-x-6">
          <!-- Notifications -->
          <button type="button" class="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500">
            <span class="sr-only">View notifications</span>
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </button>

          <!-- Separator -->
          <div class="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true"></div>

          <!-- Profile dropdown -->
          <div class="relative user-menu">
            <button
              type="button"
              class="-m-1.5 flex items-center p-1.5"
              on:click={() => userMenuOpen = !userMenuOpen}
            >
              <span class="sr-only">Open user menu</span>
              <img
                class="h-8 w-8 rounded-full bg-gray-50"
                src={profileImageUrl}
                alt="Profile"
              />
              <span class="hidden lg:flex lg:items-center">
                <span class="ml-4 text-sm font-semibold leading-6 text-gray-900" aria-hidden="true">
                  {user?.email || 'Loading...'}
                </span>
                <svg class="ml-2 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
              </span>
            </button>
            
            <!-- Dropdown menu -->
            {#if userMenuOpen}
              <div class="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
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
    </div>

    <!-- Page content -->
    <main class="py-10">
      <div class="px-4 sm:px-6 lg:px-8">
        <slot />
      </div>
    </main>
  </div>
</div>