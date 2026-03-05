<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/services/auth';
  import Button from '../../common/Button.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import LanguageSwitcher from '$lib/i18n/components/LanguageSwitcher.svelte';
  import { LayoutDashboard, FolderKanban, Shield, Play, X, Menu, ChevronDown } from 'lucide-svelte';

  interface Props {
    user?: any;
    children?: any;
  }

  let { user = null, children }: Props = $props();

  let sidebarOpen = $state(false);
  let userMenuOpen = $state(false);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
    { name: 'Admin', href: '/admin', icon: Shield },
    { name: 'Test', href: '/fillout', icon: Play },
  ];

  // Check if current route needs minimal layout
  let isDesignerRoute = $derived($page?.url?.pathname?.includes('/designer/') || false);
  let isMinimalLayout = $derived(isDesignerRoute);

  let currentPath = $derived($page?.url?.pathname || '/');

  let userInitials = $derived.by(() => {
    if (!user?.email) return '?';
    const parts = user.email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return user.email.substring(0, 2).toUpperCase();
  });

  async function handleSignOut() {
    await auth.signOut();
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

<svelte:window onclick={handleClickOutside} />

<div class="h-screen flex overflow-hidden bg-background">
  {#if !isMinimalLayout}
    <!-- Standard layout for regular pages -->

    <!-- Mobile sidebar backdrop -->
    {#if sidebarOpen}
      <button
        type="button"
        class="fixed inset-0 z-50 bg-black/[var(--backdrop-opacity)] backdrop-blur-sm lg:hidden"
        onclick={() => sidebarOpen = false}
        aria-label="Close sidebar"
      ></button>
    {/if}

    <!-- Mobile sidebar -->
    <div class="mobile-sidebar fixed inset-y-0 left-0 z-50 w-64 bg-card shadow-xl border-r border-border lg:hidden transform transition-transform duration-300 ease-in-out {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
      <div class="flex h-16 items-center justify-between px-4 border-b border-border">
        <h1 class="text-xl font-bold text-foreground">QDesigner</h1>
        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => sidebarOpen = false}
          aria-label="Close sidebar"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
      <nav class="flex-1 px-2 py-4 space-y-1">
        {#each navigation as item}
          <a
            href={item.href}
            class="group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors {currentPath.startsWith(item.href) ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}"
            onclick={() => sidebarOpen = false}
          >
            <item.icon class="mr-3 h-5 w-5 {currentPath.startsWith(item.href) ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}" />
            {item.name}
          </a>
        {/each}
      </nav>
    </div>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="bg-card border-b border-border h-16">
        <div class="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div class="flex items-center">
            <button
              type="button"
              class="sidebar-toggle p-2 text-muted-foreground hover:text-foreground transition-colors lg:hidden"
              onclick={() => sidebarOpen = true}
              aria-label="Open sidebar"
            >
              <Menu class="h-6 w-6" />
            </button>

            <!-- Logo for desktop -->
            <div class="hidden lg:flex items-center">
              <h1 class="text-xl font-bold text-foreground">QDesigner</h1>
            </div>
          </div>

          <!-- Desktop navigation -->
          <nav class="hidden lg:flex lg:space-x-8">
            {#each navigation as item}
              <a
                href={item.href}
                class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors {
                  currentPath.startsWith(item.href)
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }"
              >
                <item.icon class="mr-2 h-5 w-5" />
                {item.name}
              </a>
            {/each}
          </nav>

          <!-- User menu -->
          <div class="flex items-center gap-3">
            <LanguageSwitcher size="sm" showNativeNames={false} />
            <ThemeToggle />
            <div class="relative user-menu">
              <button
                type="button"
                class="flex items-center p-2 text-sm rounded-md hover:bg-accent transition-colors"
                onclick={() => userMenuOpen = !userMenuOpen}
                aria-label="User menu"
                aria-expanded={userMenuOpen}
              >
                <div class="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">{userInitials}</div>
                <span class="hidden sm:block ml-3 text-foreground">{user?.email || 'Loading...'}</span>
                <ChevronDown class="ml-2 h-5 w-5 text-muted-foreground" />
              </button>

              {#if userMenuOpen}
                <div class="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md bg-popover border border-border py-1 shadow-lg">
                  <a href="/settings" class="block px-4 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors">
                    Settings
                  </a>
                  <button
                    type="button"
                    class="block w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                    onclick={handleSignOut}
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
          {#if children}{@render children()}{/if}
        </div>
      </main>
    </div>
  {:else}
    <!-- Minimal layout for designer -->
    <div class="flex-1 overflow-hidden">
      {#if children}{@render children()}{/if}
    </div>
  {/if}
</div>
