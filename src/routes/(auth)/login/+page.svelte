<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import { supabase } from '$lib/services/supabase';
  import { handleAuthUser } from '$lib/database/auth-helpers';

  let email = '';
  let password = '';
  let loading = false;
  let error: string | null = null;
  let successMessage: string | null = null;

  async function handleSignIn(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        error = signInError.message;
        loading = false;
        return;
      }

      if (data.user) {
        console.log('Login successful, user:', data.user.email);
        // Sync user with our database and get organizations
        const userInfo = await handleAuthUser(data.user);
        console.log('User info:', userInfo);

        // Check if user has any organizations
        if (userInfo.organizations.length === 0) {
          console.log('No organizations, redirecting to onboarding');
          // Redirect to organization setup
          await goto('/onboarding/organization');
        } else {
          console.log('Has organizations, redirecting to dashboard');
          // Redirect to dashboard
          await goto('/dashboard');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      error = err instanceof Error ? err.message : 'An error occurred during sign in';
      loading = false;
    }
  }

  async function handleSignUp() {
    loading = true;
    error = null;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: '', // Can be collected during onboarding
        },
      },
    });

    if (signUpError) {
      error = signUpError.message;
      loading = false;
    } else {
      successMessage = 'Check your email for the confirmation link!';
      error = null;
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
      Sign in to QDesigner
    </h2>
  </div>

  <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
    <form class="space-y-6" onsubmit={handleSignIn}>
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

      <div>
        <FormGroup label="Password" id="password">
          <div slot="label" class="flex items-center justify-between w-full">
            <span>Password</span>
            <a
              href="/forgot-password"
              class="text-sm font-semibold text-primary hover:text-primary/80"
            >
              Forgot password?
            </a>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            bind:value={password}
            placeholder="Enter your password"
          />
        </FormGroup>
      </div>

      {#if error}
        <Alert variant="error">
          {error}
        </Alert>
      {/if}

      {#if successMessage}
        <Alert variant="success">
          {successMessage}
        </Alert>
      {/if}

      <div>
        <Button type="submit" variant="primary" size="lg" class="w-full" {loading}>Sign in</Button>
      </div>

      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-border"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <div class="mt-6">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            class="w-full"
            onclick={handleSignUp}
            {loading}
          >
            Create new account
          </Button>
        </div>
      </div>
    </form>

    <p class="mt-10 text-center text-sm text-muted-foreground">
      By signing in, you agree to our
      <a href="/terms" class="font-semibold leading-6 text-primary hover:text-primary/80">
        Terms
      </a>
      and
      <a href="/privacy" class="font-semibold leading-6 text-primary hover:text-primary/80">
        Privacy Policy
      </a>
    </p>
  </div>
</div>
