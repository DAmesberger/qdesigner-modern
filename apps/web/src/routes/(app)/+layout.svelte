<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
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

  // Connect WebSocket when user is authenticated. Auth rides the qd_session
  // cookie, so no token is passed through the URL or subprotocols.
  $effect(() => {
    if (!data.user) return;

    ws.connect();

    // Listen for session refresh / logout to reconnect or disconnect.
    // onAuthStateChange fires immediately with SIGNED_IN for current session;
    // skip that since we already connected above.
    let initial = true;
    const unsubAuth = auth.onAuthStateChange((event) => {
      if (initial) {
        initial = false;
        return;
      }
      if (event.event === 'TOKEN_REFRESHED') {
        ws.connect();
      } else if (event.event === 'SIGNED_OUT') {
        ws.disconnect();
      }
    });

    return () => {
      unsubAuth();
      ws.disconnect();
    };
  });

  // The whole (app) group requires an organization; the (app)/+layout.ts guard
  // already gates on an authenticated session. If a signed-in user has no
  // organization, send them to onboarding regardless of which app page they hit.
  $effect(() => {
    if (data.user && !data.organizationId) {
      void goto('/onboarding/organization');
    }
  });
</script>

<!-- This layout wraps all authenticated app pages with the AppShell -->
<AppShell user={data.user}>
  {#key page.url.pathname}
    <div
      in:fade={{ duration: reducedMotion ? 0 : 150, delay: reducedMotion ? 0 : 50 }}
      out:fade={{ duration: reducedMotion ? 0 : 100 }}
    >
      {@render children()}
    </div>
  {/key}
</AppShell>
