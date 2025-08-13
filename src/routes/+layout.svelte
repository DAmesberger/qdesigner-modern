<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  import Toast from '$lib/components/ui/Toast.svelte';
  import OfflineIndicator from '$lib/components/ui/OfflineIndicator.svelte';
  import { theme } from '$lib/stores/theme';
  import { offline, requestPersistentStorage } from '$lib/services/offline';
  
  let user = $state<any>(null);
  let loading = $state(true);
  
  onMount(async () => {
    // Import modules on client-side only
    console.log('[Layout] Starting module registration...');
    try {
      const moduleExports = await import('$lib/modules');
      console.log('[Layout] Module exports:', Object.keys(moduleExports));
      
      if (moduleExports.registerAllModules) {
        await moduleExports.registerAllModules();
        console.log('[Layout] Modules registered successfully');
      } else {
        console.error('[Layout] registerAllModules not found in module exports');
      }
    } catch (err) {
      console.error('[Layout] Failed to load modules:', err);
    }
    
    // Import test mode utilities in development
    if (import.meta.env.DEV) {
      import('$lib/utils/testMode');
    }
    
    // Initialize theme
    theme.init();
    
    // Initialize offline support
    offline.init();
    
    // Request persistent storage for better offline experience
    requestPersistentStorage();
    
    // For client-side routes, auth is handled in their own layouts
    loading = false;
    
    // Listen for auth changes
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        user = session?.user ?? null;
      });
      
      return () => subscription.unsubscribe();
    } catch (error) {
      console.error('Error setting up auth listener:', error as Error);
      return () => {}; // Return empty cleanup function
    }
  });
</script>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-layer-base">
    <Spinner size="lg" />
  </div>
{:else}
  <slot />
  <Toast />
  <OfflineIndicator />
{/if}