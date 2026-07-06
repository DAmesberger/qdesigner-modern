<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';

  let error = $state<string | null>(null);

  onMount(async () => {
    // The OIDC callback set an httpOnly refresh cookie for the backend origin.
    // Establishing the session is just a refresh from that cookie — the access
    // token in the URL fragment (if present) is informational only and is
    // stripped from the address bar below.
    try {
      if (typeof history !== 'undefined' && window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      const session = await auth.getSession();
      if (!session) {
        error = 'Could not complete single sign-on. Please try again.';
        return;
      }

      const orgs = await api.organizations.list();
      await goto(orgs && orgs.length > 0 ? '/dashboard' : '/onboarding/organization');
    } catch (err) {
      console.error('SSO completion failed:', err);
      error = 'Could not complete single sign-on. Please try again.';
    }
  });
</script>

<div class="flex min-h-screen items-center justify-center p-8">
  <div class="w-full max-w-md text-center">
    {#if error}
      <Alert variant="error">{error}</Alert>
      <a href="/login" class="mt-4 inline-block text-primary hover:underline">Back to sign in</a>
    {:else}
      <div
        class="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary"
      ></div>
      <p class="text-muted-foreground">Completing single sign-on…</p>
    {/if}
  </div>
</div>
