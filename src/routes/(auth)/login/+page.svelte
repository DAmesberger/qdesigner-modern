<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import { t } from '$lib/i18n/hooks';

  let email = '';
  let password = '';
  let loading = false;
  let error: string | null = null;
  let successMessage: string | null = null;

  interface DevQuickLoginPersona {
    id: string;
    label: string;
    email: string;
    password: string;
  }

  function normalizeErrorMessage(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    if (value && typeof value === 'object') {
      const maybe = value as { message?: unknown; error?: unknown };
      if (typeof maybe.message === 'string' && maybe.message.trim().length > 0) {
        return maybe.message;
      }
      if (typeof maybe.error === 'string' && maybe.error.trim().length > 0) {
        return maybe.error;
      }
    }

    return fallback;
  }

  function getDevQuickLoginPersonas(): DevQuickLoginPersona[] {
    if (!import.meta.env.DEV || import.meta.env.VITE_DEV_QUICK_LOGIN_ENABLED !== 'true') {
      return [];
    }

    const personas: Array<DevQuickLoginPersona | null> = [
      {
        id: 'admin',
        label: 'Admin',
        email: import.meta.env.VITE_DEV_LOGIN_ADMIN_EMAIL || '',
        password: import.meta.env.VITE_DEV_LOGIN_ADMIN_PASSWORD || '',
      },
      {
        id: 'editor',
        label: 'Editor',
        email: import.meta.env.VITE_DEV_LOGIN_EDITOR_EMAIL || '',
        password: import.meta.env.VITE_DEV_LOGIN_EDITOR_PASSWORD || '',
      },
      {
        id: 'viewer',
        label: 'Viewer',
        email: import.meta.env.VITE_DEV_LOGIN_VIEWER_EMAIL || '',
        password: import.meta.env.VITE_DEV_LOGIN_VIEWER_PASSWORD || '',
      },
      {
        id: 'participant',
        label: 'Participant',
        email: import.meta.env.VITE_DEV_LOGIN_PARTICIPANT_EMAIL || '',
        password: import.meta.env.VITE_DEV_LOGIN_PARTICIPANT_PASSWORD || '',
      },
    ].map((persona) => {
      if (!persona.email || !persona.password) return null;
      return persona;
    });

    return personas.filter((persona): persona is DevQuickLoginPersona => persona !== null);
  }

  const devQuickLoginPersonas = getDevQuickLoginPersonas();
  const showDevQuickLogin = import.meta.env.DEV && devQuickLoginPersonas.length > 0;

  async function signInAndRedirect(signInEmail: string, signInPassword: string) {
    loading = true;
    error = null;
    successMessage = null;

    try {
      const { user: signedInUser, error: signInError } = await auth.signIn(
        signInEmail,
        signInPassword
      );

      if (signInError) {
        error = normalizeErrorMessage(signInError, 'Sign in failed');
        return;
      }

      if (signedInUser) {
        console.log('Login successful, user:', signedInUser.email);

        const orgs = await api.organizations.list();
        if (orgs.length === 0) {
          console.log('No organizations, redirecting to onboarding');
          await goto('/onboarding/organization');
        } else {
          console.log('Has organizations, redirecting to dashboard');
          await goto('/dashboard');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      error = err instanceof Error ? err.message : 'An error occurred during sign in';
    } finally {
      loading = false;
    }
  }

  async function handleSignIn(e: Event) {
    e.preventDefault();
    await signInAndRedirect(email, password);
  }

  async function handleDevQuickLogin(persona: DevQuickLoginPersona) {
    email = persona.email;
    password = persona.password;
    await auth.ensureDevQuickLoginPersonas();
    await signInAndRedirect(persona.email, persona.password);
  }

  async function handleSignUp() {
    loading = true;
    error = null;

    const { error: signUpError } = await auth.signUp(email, password, '');

    if (signUpError) {
      error = normalizeErrorMessage(signUpError, 'Sign up failed');
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
      {$t('auth.login.title')}
    </h2>
  </div>

  <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
    <form class="space-y-6" onsubmit={handleSignIn}>
      <FormGroup label={$t('auth.login.email')} id="email">
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
        <FormGroup id="password">
          {#snippet labelSnippet()}
            <div class="flex items-center justify-between w-full">
              <span>{$t('auth.login.password')}</span>
              <a
                href="/forgot-password"
                class="text-sm font-semibold text-primary hover:text-primary/80"
              >
                {$t('auth.login.forgot')}
              </a>
            </div>
          {/snippet}
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
        <Button type="submit" variant="primary" size="lg" class="w-full" {loading}>{$t('auth.login.submit')}</Button>
      </div>

      {#if showDevQuickLogin}
        <div
          class="rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 p-3"
          data-testid="dev-quick-login-panel"
        >
          <div class="mb-2 flex items-center justify-between">
            <p
              class="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300"
            >
              Dev Quick Login
            </p>
            <span class="text-[11px] text-amber-700 dark:text-amber-300">Development only</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            {#each devQuickLoginPersonas as persona}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="justify-start border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15"
                onclick={() => handleDevQuickLogin(persona)}
                {loading}
                data-testid={`dev-quick-login-${persona.id}`}
              >
                {persona.label}
              </Button>
            {/each}
          </div>
        </div>
      {/if}

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
            {$t('auth.signup.submit')}
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
