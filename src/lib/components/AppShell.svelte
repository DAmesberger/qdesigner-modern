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
        profileImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser.email || '')}&background=8b5cf6&color=fff&bold=true`;
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

  // Updated icons to be thinner and cleaner
  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
    },
    {
      name: 'Designer',
      href: '/designer',
      icon: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0-9.052a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm4.145 9.052a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0-9.052a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128z',
    }, // Simplified icon for now
    { name: 'Admin', href: '/admin', icon: 'M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z' }, // Chart Pie
    {
      name: 'Test',
      href: '/fillout',
      icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z',
    }, // Play
  ];

  $: currentPath = $page.url.pathname;

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

<div class="h-screen flex overflow-hidden bg-transparent">
  <!-- Mobile sidebar backdrop -->
  {#if sidebarOpen}
    <button
      type="button"
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity"
      on:click={() => (sidebarOpen = false)}
      aria-label="Close sidebar"
    ></button>
  {/if}

  <!-- Mobile sidebar -->
  <div
    class="mobile-sidebar fixed inset-y-0 left-0 z-50 w-64 glass-sidebar lg:hidden transform transition-transform duration-300 ease-in-out {sidebarOpen
      ? 'translate-x-0'
      : '-translate-x-full'}"
  >
    <div class="flex h-16 items-center justify-between px-4 border-b border-[var(--glass-border)]">
      <div class="flex items-center gap-2">
        <div
          class="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg"
        >
          Q
        </div>
        <span
          class="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600"
          >QDesigner</span
        >
      </div>
      <button
        type="button"
        class="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        on:click={() => (sidebarOpen = false)}
        aria-label="Close sidebar"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <nav class="flex-1 px-4 py-6 space-y-2">
      {#each navigation as item}
        <a
          href={item.href}
          class="group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 {currentPath.startsWith(
            item.href
          )
            ? 'bg-indigo-500/10 text-indigo-600 shadow-sm'
            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}"
          on:click={() => (sidebarOpen = false)}
        >
          <svg
            class="mr-3 h-5 w-5 transition-colors {currentPath.startsWith(item.href)
              ? 'text-indigo-600'
              : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]'}"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
          </svg>
          {item.name}
        </a>
      {/each}
    </nav>
  </div>

  <!-- Desktop sidebar -->
  <div
    class="hidden lg:flex lg:flex-col transition-all duration-300 {sidebarCollapsed
      ? 'w-20'
      : 'w-72'} glass-sidebar z-50"
  >
    <div class="flex h-16 items-center justify-between px-6 border-b border-[var(--glass-border)]">
      {#if !sidebarCollapsed}
        <div class="flex items-center gap-3">
          <div
            class="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg"
          >
            Q
          </div>
          <span
            class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600"
            >Designer</span
          >
        </div>
      {:else}
        <div
          class="h-8 w-8 mx-auto rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg"
        >
          Q
        </div>
      {/if}
      <button
        on:click={toggleSidebarCollapse}
        class="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          class="h-5 w-5 transition-transform duration-300 {sidebarCollapsed ? 'rotate-180' : ''}"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
    </div>

    <nav class="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
      {#each navigation as item}
        <a
          href={item.href}
          class="group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 {currentPath.startsWith(
            item.href
          )
            ? 'bg-indigo-500/10 text-indigo-700 shadow-sm border border-indigo-500/20'
            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]'} overflow-hidden relative"
          title={sidebarCollapsed ? item.name : ''}
        >
          <!-- Active indicator pill -->
          {#if currentPath.startsWith(item.href)}
            <div
              class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full {sidebarCollapsed
                ? '-left-2'
                : '-left-2'}"
            ></div>
          {/if}

          <svg
            class="h-6 w-6 transition-colors {currentPath.startsWith(item.href)
              ? 'text-indigo-600'
              : 'text-[hsl(var(--muted-foreground))] group-hover:text-indigo-500'} {sidebarCollapsed
              ? 'mx-auto'
              : 'mr-3'}"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
          </svg>
          {#if !sidebarCollapsed}
            <span class="truncate">{item.name}</span>
          {/if}
        </a>
      {/each}
    </nav>

    <div class="border-t border-[var(--glass-border)] p-4 bg-[var(--glass-bg)]">
      {#if !sidebarCollapsed}
        <div class="flex items-center gap-3">
          <img
            class="h-9 w-9 rounded-full ring-2 ring-white/50 shadow-sm"
            src={profileImageUrl}
            alt="Profile"
          />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
              {user?.email || 'Loading...'}
            </p>
            <p class="text-xs text-[hsl(var(--muted-foreground))]">Pro Plan</p>
          </div>
          <!-- Settings gear -->
          <button
            class="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            aria-label="Settings"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      {:else}
        <img
          class="h-9 w-9 rounded-full mx-auto ring-2 ring-white/50 shadow-sm"
          src={profileImageUrl}
          alt="Profile"
        />
      {/if}
    </div>
  </div>

  <!-- Main content area -->
  <div class="flex-1 flex flex-col overflow-hidden bg-transparent">
    <!-- Top bar -->
    <header class="glass-header h-16">
      <div class="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <button
          type="button"
          class="sidebar-toggle p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] lg:hidden"
          aria-label="Toggle sidebar"
          on:click={() => (sidebarOpen = true)}
        >
          <svg
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>

        <div class="flex-1">
          <!-- Search bar (placeholder) -->
          <div class="max-w-md hidden md:block">
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  class="h-5 w-5 text-[hsl(var(--muted-foreground))]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                class="block w-full pl-10 pr-3 py-2 border-0 rounded-lg leading-5 glass-input text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:placeholder-gray-400 sm:text-sm"
                placeholder="Search projects..."
              />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <!-- Notifications -->
          <button
            type="button"
            class="relative p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
            aria-label="View notifications"
          >
            <span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse"
            ></span>
            <svg
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
          </button>

          <!-- User menu -->
          <div class="relative user-menu">
            <button
              type="button"
              class="flex items-center p-1.5 text-sm rounded-full ring-2 ring-transparent focus:ring-indigo-500 transition-all"
              on:click={() => (userMenuOpen = !userMenuOpen)}
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              <img class="h-8 w-8 rounded-full shadow-sm" src={profileImageUrl} alt="Profile" />
              <span class="hidden sm:block ml-3 text-[hsl(var(--foreground))] font-medium"
                >{user?.email || 'Loading...'}</span
              >
              <svg
                class="ml-2 h-5 w-5 text-[hsl(var(--muted-foreground))]"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>

            {#if userMenuOpen}
              <div
                class="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl glass shadow-xl ring-1 ring-black ring-opacity-5 py-1 animate-in fade-in zoom-in duration-200"
              >
                <div class="px-4 py-3 border-b border-[var(--glass-border)]">
                  <p class="text-sm font-medium text-[hsl(var(--foreground))]">Signed in as</p>
                  <p class="text-xs text-[hsl(var(--muted-foreground))] truncate">{user?.email}</p>
                </div>
                <a
                  href="/settings"
                  class="block px-4 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                >
                  Your Profile
                </a>
                <a
                  href="/settings"
                  class="block px-4 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                >
                  Settings
                </a>
                <button
                  type="button"
                  class="block w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
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
    <main class="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
      <slot />
    </main>
  </div>
</div>
