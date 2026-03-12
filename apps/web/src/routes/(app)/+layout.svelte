<script lang="ts">
  import { page } from '$app/stores';
  import { fade } from 'svelte/transition';
  import AppShell from '$lib/components/ui/layout/AppShell.svelte';
  import { ws } from '$lib/services/ws';
  import { auth } from '$lib/services/auth';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  interface Props {
    data: LayoutData;
    children: Snippet;
  }

  let { data, children }: Props = $props();

  let reducedMotion = $state(false);

  $effect(() => {
    if (typeof window !== 'undefined') {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  });

  // Connect WebSocket when user is authenticated, and reconnect on token refresh
  $effect(() => {
    if (!data.user) return;

    const token = auth.getAccessToken();
    if (token) {
      ws.connect(token);
    }

    // Listen for token refresh / logout to reconnect or disconnect.
    // onAuthStateChange fires immediately with SIGNED_IN for current session;
    // skip that since we already connected above.
    let initial = true;
    const unsubAuth = auth.onAuthStateChange((event) => {
      if (initial) {
        initial = false;
        return;
      }
      if (event.event === 'TOKEN_REFRESHED') {
        const newToken = auth.getAccessToken();
        if (newToken) {
          ws.connect(newToken);
        }
      } else if (event.event === 'SIGNED_OUT') {
        ws.disconnect();
      }
    });

    return () => {
      unsubAuth();
      ws.disconnect();
    };
  });

  // Redirect to onboarding if user has no organization
  $effect(() => {
    // Only redirect if we're on a protected route and user has no organization
    const protectedPaths = ['/dashboard', '/projects', '/admin'];
    const isProtectedPath = protectedPaths.some(path => $page?.url?.pathname?.startsWith(path));

    if (data.user && !data.organizationId && isProtectedPath) {
      if (typeof window !== 'undefined') {
        window.location.href = '/onboarding/organization';
      }
    }
  });
</script>

<!-- This layout wraps all authenticated app pages with the AppShell -->
<AppShell user={data.user}>
  {#key $page.url.pathname}
    <div
      in:fade={{ duration: reducedMotion ? 0 : 150, delay: reducedMotion ? 0 : 50 }}
      out:fade={{ duration: reducedMotion ? 0 : 100 }}
    >
      {@render children()}
    </div>
  {/key}
</AppShell>