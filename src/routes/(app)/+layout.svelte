<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/ui/layout/AppShell.svelte';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';
  
  interface Props {
    data: LayoutData;
    children: Snippet;
  }
  
  let { data, children }: Props = $props();
  
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
  {@render children()}
</AppShell>