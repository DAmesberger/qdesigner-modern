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
  
  let user: any = null;
  let loading = true;
  
  onMount(() => {
    // Initialize theme
    theme.init();
    
    // Initialize offline support
    offline.init();
    
    // Request persistent storage for better offline experience
    requestPersistentStorage();
    
    // Check initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        user = session?.user ?? null;
      })
      .catch((error) => {
        console.error('Error checking auth session:', error);
        user = null;
      })
      .finally(() => {
        loading = false;
      });
    
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
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <Spinner size="lg" />
  </div>
{:else}
  <slot />
  <Toast />
  <OfflineIndicator />
{/if}