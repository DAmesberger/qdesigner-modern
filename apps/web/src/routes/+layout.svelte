<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import Toast from '$lib/components/ui/Toast.svelte';
  import OfflineIndicator from '$lib/components/ui/OfflineIndicator.svelte';
  import { theme } from '$lib/stores/theme';
  import { offline, requestPersistentStorage } from '$lib/services/offline';
  // i18n — importing config triggers i18next initialization
  import '$lib/i18n/config';

  let { children } = $props();

  onMount(() => {
    // Import modules on client-side only (Async, fire-and-forget)
    (async () => {
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
    })();

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

    // Initialize auth service
    auth.init();

    return () => {};
  });
</script>

{@render children()}
<Toast />
<OfflineIndicator />
