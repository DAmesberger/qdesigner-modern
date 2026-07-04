<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import Toast from '$lib/components/ui/Toast.svelte';
  import OfflineIndicator from '$lib/components/ui/OfflineIndicator.svelte';
  import { theme } from '$lib/stores/theme';
  import { offline, requestPersistentStorage } from '$lib/services/offline';
  // i18n — Paraglide (ADR 0019). Locale is resolved at load via the
  // cookie/preferredLanguage strategy; reflect it onto <html> (lang/dir/rtl).
  import { applyDocumentLocale } from '$lib/i18n/locale';

  let { children } = $props();

  onMount(() => {
    // Reflect the active locale onto <html> (lang + dir + rtl/ltr class).
    applyDocumentLocale();

    // Register question/display modules on client-side (async, fire-and-forget).
    // This is the fast path; the registration is idempotent and awaitable, so the
    // fillout runtime awaits the very same promise before starting a resumed
    // session rather than racing this onMount (Slice 1.8).
    (async () => {
      console.log('[Layout] Starting module registration...');
      try {
        const { ensureModulesRegistered } = await import('$lib/modules/register-all');
        await ensureModulesRegistered();
        console.log('[Layout] Modules registered successfully');
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
