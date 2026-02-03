<script lang="ts">
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import { clickOutside } from '$lib/utils/clickOutside';

  export let user: { email: string; full_name?: string } | null = null;

  let isOpen = false;

  function toggleMenu() {
    isOpen = !isOpen;
  }

  function closeMenu() {
    isOpen = false;
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      goto('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  function handleNavigation(path: string) {
    closeMenu();
    goto(path);
  }

  $: initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';
</script>

{#if user}
  <div class="relative user-menu" use:clickOutside={closeMenu}>
    <button
      type="button"
      on:click={toggleMenu}
      class="flex items-center p-2 text-sm rounded-md hover:bg-gray-100"
      aria-label="User menu"
      aria-expanded={isOpen}
    >
      {#if user.full_name}
        <div class="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center">
          <span class="text-white text-sm font-medium">{initials}</span>
        </div>
      {:else}
        <img
          class="h-8 w-8 rounded-full"
          src="https://ui-avatars.com/api/?name={encodeURIComponent(
            user.email
          )}&background=6366f1&color=fff"
          alt="Profile"
        />
      {/if}
      <span class="hidden sm:block ml-3 text-gray-700">{user.email}</span>
      <svg
        class="ml-2 h-5 w-5 text-gray-400 transition-transform duration-200"
        class:rotate-180={isOpen}
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

    {#if isOpen}
      <div
        class="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="user-menu-button"
        tabindex="-1"
      >
        <div class="py-1" role="none">
          <div class="px-4 py-2 text-sm text-gray-700 border-b border-gray-200">
            <div class="font-medium">{user.full_name || 'User'}</div>
            <div class="text-xs text-gray-500 mt-0.5">{user.email}</div>
          </div>

          <button
            on:click={() => handleNavigation('/profile')}
            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            role="menuitem"
          >
            <div class="flex items-center">
              <svg
                class="mr-3 h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Profile Settings
            </div>
          </button>

          <button
            on:click={() => handleNavigation('/organization/settings')}
            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            role="menuitem"
          >
            <div class="flex items-center">
              <svg
                class="mr-3 h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              Organization Settings
            </div>
          </button>

          <button
            on:click={() => handleNavigation('/help')}
            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            role="menuitem"
          >
            <div class="flex items-center">
              <svg
                class="mr-3 h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Help & Support
            </div>
          </button>

          <div class="border-t border-gray-200 mt-1 pt-1">
            <button
              on:click={handleSignOut}
              class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              role="menuitem"
            >
              <div class="flex items-center">
                <svg
                  class="mr-3 h-5 w-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign out
              </div>
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
