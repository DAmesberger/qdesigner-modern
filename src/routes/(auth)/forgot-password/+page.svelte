<script lang="ts">
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import { api } from '$lib/services/api';

  let email = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let submitted = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;

    try {
      await api.post('/api/auth/password-reset', { email });
      submitted = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to send reset email';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-background">
  <div class="sm:mx-auto sm:w-full sm:max-w-sm">
    <div class="flex items-center justify-center gap-2 mb-6">
      <div class="relative">
        <div
          class="absolute inset-0 bg-gradient-to-r from-primary to-primary-foreground blur-lg opacity-75"
        ></div>
        <svg class="relative w-12 h-12 text-primary" viewBox="0 0 32 32" fill="currentColor">
          <path d="M16 2L2 9v14l14 7 14-7V9L16 2zm0 4l8 4v8l-8 4-8-4V10l8-4z" />
        </svg>
      </div>
    </div>
    <h2 class="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-foreground">
      Reset your password
    </h2>
    <p class="mt-2 text-center text-sm text-muted-foreground">
      Enter your email address and we'll send you a link to reset your password.
    </p>
  </div>

  <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
    {#if submitted}
      <Alert variant="success">
        If an account exists with that email, you'll receive a password reset link shortly. Check
        your inbox.
      </Alert>
      <div class="mt-6 text-center">
        <a href="/login" class="text-sm font-semibold text-primary hover:text-primary/80">
          Back to sign in
        </a>
      </div>
    {:else}
      <form class="space-y-6" onsubmit={handleSubmit}>
        <FormGroup label="Email address" id="email">
          <Input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            required
            bind:value={email}
            placeholder="Enter your email"
          />
        </FormGroup>

        {#if error}
          <Alert variant="error">
            {error}
          </Alert>
        {/if}

        <Button type="submit" variant="primary" size="lg" class="w-full" {loading}>
          Send reset link
        </Button>

        <div class="text-center">
          <a href="/login" class="text-sm font-semibold text-primary hover:text-primary/80">
            Back to sign in
          </a>
        </div>
      </form>
    {/if}
  </div>
</div>
