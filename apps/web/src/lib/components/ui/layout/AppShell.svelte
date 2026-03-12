<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/services/auth';
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

<div class="flex min-h-dvh bg-background text-foreground">
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
    <div class="mobile-sidebar fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card shadow-xl lg:hidden transform transition-transform duration-300 ease-in-out {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
      <div class="flex h-16 items-center justify-between border-b border-border px-4">
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
      <nav class="flex-1 space-y-1 px-3 py-4">
        {#each navigation as item}
          <a
            href={item.href}
            data-nav={item.href === '/' ? 'home' : item.href.slice(1)}
            class="group flex items-center rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors {currentPath.startsWith(item.href) ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}"
            onclick={() => sidebarOpen = false}
          >
            <item.icon class="mr-3 h-5 w-5 {currentPath.startsWith(item.href) ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}" />
            {item.name}
          </a>
        {/each}
      </nav>
    </div>

    <!-- Main content area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Top bar -->
      <header class="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div class="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:px-10">
          <div class="flex min-w-0 items-center gap-2">
            <button
              type="button"
              class="sidebar-toggle rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
              onclick={() => sidebarOpen = true}
              aria-label="Open sidebar"
            >
              <Menu class="h-6 w-6" />
            </button>

            <!-- Logo for desktop -->
            <div class="hidden lg:flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
                <LayoutDashboard class="h-5 w-5 text-primary" />
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">QDesigner</p>
                <p class="text-sm font-medium text-foreground">Research workspace</p>
              </div>
            </div>
          </div>

          <!-- Desktop navigation -->
          <nav class="hidden items-center gap-1 lg:flex">
            {#each navigation as item}
              <a
                href={item.href}
                data-nav={item.href === '/' ? 'home' : item.href.slice(1)}
                class="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors {
                  currentPath.startsWith(item.href)
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }"
              >
                <item.icon class="mr-2 h-5 w-5" />
                {item.name}
              </a>
            {/each}
          </nav>

          <!-- User menu -->
          <div class="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher size="sm" showNativeNames={false} />
            <ThemeToggle />
            <div class="relative user-menu">
              <button
                type="button"
                class="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 px-2 py-2 text-sm transition-colors hover:bg-accent"
                onclick={() => userMenuOpen = !userMenuOpen}
                aria-label="User menu"
                aria-expanded={userMenuOpen}
              >
                <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{userInitials}</div>
                <span class="hidden sm:block max-w-[220px] truncate text-foreground">{user?.email || 'Loading...'}</span>
                <ChevronDown class="h-5 w-5 text-muted-foreground" />
              </button>

              {#if userMenuOpen}
                <div class="absolute right-0 z-50 mt-2 w-52 origin-top-right rounded-2xl border border-border bg-popover py-1 shadow-lg">
                  <a href="/settings" class="block px-4 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent">
                    Settings
                  </a>
                  <button
                    type="button"
                    class="block w-full px-4 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent"
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
      <main class="min-h-0 flex-1 overflow-auto">
        <div class="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10 2xl:px-12">
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
