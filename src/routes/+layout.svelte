<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  import { theme } from '$lib/stores/theme';
  
  let user: any = null;
  let loading = true;
  
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
      console.error('Error setting up auth listener:', error);
    }
  });
</script>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <Spinner size="lg" />
  </div>
{:else}
  <slot />
{/if}