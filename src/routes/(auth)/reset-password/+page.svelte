<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import { api } from '$lib/services/api';

  let newPassword = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  let token = $derived($page.url.searchParams.get('token') ?? '');

  let passwordStrength = $derived(calculatePasswordStrength(newPassword));
  let passwordsMatch = $derived(
    confirmPassword.length > 0 && newPassword === confirmPassword
  );

  function calculatePasswordStrength(pwd: string): { score: number; label: string; color: string } {
    if (!pwd) return { score: 0, label: '', color: '' };

    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = [
      '',
      'text-red-500',
      'text-orange-500',
      'text-yellow-500',
      'text-green-500',
      'text-green-600',
    ];

    return {
      score: Math.min(score, 5),
      label: labels[Math.min(score, 5)] || '',
      color: colors[Math.min(score, 5)] || '',
    };
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (newPassword.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }

    if (!token) {
      error = 'Missing reset token. Please use the link from your email.';
      return;
    }

    loading = true;
    error = null;

    try {
      await api.post('/api/auth/password-reset/confirm', {
        token,
        new_password: newPassword,
      });
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to reset password';
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
      Set new password
    </h2>
    <p class="mt-2 text-center text-sm text-muted-foreground">
      Choose a strong password for your account.
    </p>
  </div>

  <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
    {#if !token}
      <Alert variant="error">
        Invalid reset link. Please request a new password reset from the
        <a href="/forgot-password" class="font-semibold underline">forgot password</a> page.
      </Alert>
    {:else if success}
      <Alert variant="success">
        Your password has been reset successfully. You can now sign in with your new password.
      </Alert>
      <div class="mt-6">
        <Button
          type="button"
          variant="primary"
          size="lg"
          class="w-full"
          onclick={() => goto('/login')}
        >
          Go to sign in
        </Button>
      </div>
    {:else}
      <form class="space-y-6" onsubmit={handleSubmit}>
        <FormGroup label="New password" id="new-password">
          <Input
            id="new-password"
            name="new-password"
            type="password"
            autocomplete="new-password"
            required
            bind:value={newPassword}
            placeholder="Enter new password"
            minLength={8}
          />
          {#if newPassword}
            <div class="mt-2">
              <div class="flex gap-1 mb-1">
                {#each Array(5) as _, i}
                  <div
                    class="h-1 flex-1 rounded-full transition-colors"
                    class:bg-gray-200={i >= passwordStrength.score}
                    class:bg-red-500={i < passwordStrength.score && passwordStrength.score <= 2}
                    class:bg-yellow-500={i < passwordStrength.score &&
                      passwordStrength.score === 3}
                    class:bg-green-500={i < passwordStrength.score && passwordStrength.score >= 4}
                  ></div>
                {/each}
              </div>
              <p class="text-sm {passwordStrength.color}">
                {passwordStrength.label}
              </p>
            </div>
          {/if}
        </FormGroup>

        <FormGroup label="Confirm password" id="confirm-password">
          <Input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autocomplete="new-password"
            required
            bind:value={confirmPassword}
            placeholder="Confirm new password"
            minLength={8}
          />
          {#if confirmPassword && !passwordsMatch}
            <p class="mt-1 text-sm text-red-500">Passwords do not match</p>
          {/if}
        </FormGroup>

        {#if error}
          <Alert variant="error">
            {error}
          </Alert>
        {/if}

        <Button type="submit" variant="primary" size="lg" class="w-full" {loading}>
          Reset password
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
