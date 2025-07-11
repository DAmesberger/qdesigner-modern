<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import AppShell from '$lib/components/ui/layout/AppShell.svelte';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  import { theme } from '$lib/stores/theme';
  
  let user: any = null;
  let loading = true;
  
  // Routes that don't require authentication
  const publicRoutes = [
    '/', 
    '/login', 
    '/signup', 
    '/forgot-password',
    '/onboarding/organization',
    '/features',
    '/pricing',
    '/solutions',
    '/solutions/research',
    '/solutions/education', 
    '/solutions/healthcare',
    '/company/about',
    '/company/careers',
    '/company/contact',
    '/resources',
    '/resources/docs',
    '/resources/blog',
    '/legal/privacy',
    '/legal/terms',
    // Auth routes
    '/(auth)/login',
    '/(auth)/signup',
    '/(auth)/forgot-password',
    // Test routes
    '/dashboard-test'
  ];
  
  // Routes that should not show the app shell
  const noShellRoutes = [...publicRoutes];
  
  $: showAppShell = user && !noShellRoutes.includes($page.url.pathname);
  
  onMount(() => {
    // Initialize theme
    theme.init();
    
    // Check initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        user = session?.user ?? null;
      })
      .catch((error) => {
        console.error('Error checking auth session:', error);
        // If Supabase is not available, just continue without auth
        user = null;
      })
      .finally(() => {
        loading = false;
        
        // Redirect to login if not authenticated and on protected route
        if (!user && !publicRoutes.includes($page.url.pathname)) {
          goto('/login');
        }
      });
    
    // Listen for auth changes
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        user = session?.user ?? null;
        
        if (!user && !publicRoutes.includes($page.url.pathname)) {
          goto('/login');
        } else if (user && $page.url.pathname === '/login') {
          goto('/dashboard');
        }
      });
      
      return () => subscription.unsubscribe();
    } catch (error) {
      console.error('Error setting up auth listener:', error);
    }
  });
</script>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <Spinner size="lg" />
  </div>
{:else if showAppShell}
  <AppShell {user}>
    <slot />
  </AppShell>
{:else}
  <slot />
{/if}