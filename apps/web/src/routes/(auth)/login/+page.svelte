<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    ArrowRight,
    BarChart3,
    Check,
    Clock,
    FlaskConical,
    ShieldCheck,
    Users,
    Zap,
  } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import { m } from '$lib/paraglide/messages';

  let email = '';
  let password = '';
  let loading = false;
  let error: string | null = null;
  let successMessage: string | null = null;

  // Same-origin relative redirect target (must start with a single '/').
  function safeRedirect(raw: string | null): string | null {
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
    return raw;
  }

  $: redirectParam = safeRedirect($page.url.searchParams.get('redirect'));
  $: signupHref = redirectParam
    ? `/signup?redirect=${encodeURIComponent(redirectParam)}`
    : '/signup';

  interface DevQuickLoginPersona {
    id: string;
    label: string;
    email: string;
    password: string;
  }

  function normalizeErrorMessage(value: unknown, fallback: string): string {
    if (value instanceof Error) {
      if (value.message.trim().length > 0 && value.message !== '[object Object]') {
        return value.message;
      }
      return fallback;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      if (value === '[object Object]') {
        return fallback;
      }
      return value;
    }

    if (value && typeof value === 'object') {
      const maybe = value as { message?: unknown; error?: unknown; details?: unknown };
      if (typeof maybe.message === 'string' && maybe.message.trim().length > 0) {
        return maybe.message;
      }
      if (typeof maybe.error === 'string' && maybe.error.trim().length > 0) {
        return maybe.error;
      }
      if (maybe.error && typeof maybe.error === 'object') {
        const nested = maybe.error as { message?: unknown };
        if (typeof nested.message === 'string' && nested.message.trim().length > 0) {
          return nested.message;
        }
      }
      if (maybe.details && typeof maybe.details === 'object') {
        const detailEntries = Object.values(maybe.details as Record<string, unknown>)
          .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);

        if (detailEntries.length > 0) {
          return detailEntries.join(', ');
        }
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

  onMount(() => {
    if (!showDevQuickLogin) return;

    void auth.ensureDevQuickLoginPersonas().catch((bootstrapError) => {
      console.warn('Failed to provision dev quick-login personas', bootstrapError);
    });
  });

  const authStats = [
    { value: '<1 ms', label: 'Timing visibility' },
    { value: '500+', label: 'Teams using shared workflows' },
    { value: 'Audit ready', label: 'Versioned release history' },
  ] as const;

  const authHighlights = [
    {
      title: 'Study builder',
      description: 'Compose survey pages, task modules, and routing rules in one canvas.',
      icon: FlaskConical,
    },
    {
      title: 'Live oversight',
      description: 'Watch quotas, session quality, and review notes as fieldwork happens.',
      icon: BarChart3,
    },
    {
      title: 'Secure handoff',
      description: 'Keep exports tied to the exact version and approval context behind them.',
      icon: ShieldCheck,
    },
    {
      title: 'Team collaboration',
      description: 'Review studies with comments, ownership, and cleaner decision trails.',
      icon: Users,
    },
  ] as const;

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
        if (redirectParam) {
          await goto(redirectParam);
          return;
        }

        const orgs = await api.organizations.list();
        if (orgs.length === 0) {
          await goto('/onboarding/organization');
        } else {
          await goto('/dashboard');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      error = normalizeErrorMessage(err, 'An error occurred during sign in');
    } finally {
      loading = false;
    }
  }

  async function handleSignIn(e: Event) {
    e.preventDefault();
    if (showDevQuickLogin) {
      await auth.ensureDevQuickLoginPersonas();
    }
    await signInAndRedirect(email, password);
  }

  async function handleDevQuickLogin(persona: DevQuickLoginPersona) {
    email = persona.email;
    password = persona.password;
    await auth.ensureDevQuickLoginPersonas();
    await signInAndRedirect(persona.email, persona.password);
  }

</script>

<div class="flex min-h-screen items-center px-4 py-6 sm:px-6 lg:px-8">
  <div class="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
    <section
      class="relative hidden overflow-hidden rounded-[32px] border border-white/10 bg-slate-950 p-8 text-white shadow-[0_36px_90px_-48px_rgba(15,23,42,0.95)] lg:flex lg:min-h-[760px] lg:flex-col"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-sky-500/20 via-transparent to-primary/20"
      ></div>
      <div class="absolute -right-20 top-16 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl"></div>
      <div class="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-primary/20 blur-3xl"></div>

      <div class="relative flex items-center gap-3">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg shadow-slate-950/30"
        >
          <svg class="h-7 w-7" viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2L2 9v14l14 7 14-7V9L16 2zm0 4l8 4v8l-8 4-8-4V10l8-4z" />
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.28em] text-slate-300">QDesigner</p>
          <p class="text-sm text-slate-400">Research operations workspace</p>
        </div>
      </div>

      <div class="relative mt-20 max-w-xl">
        <div
          class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200"
        >
          <Zap class="h-4 w-4 text-sky-300" />
          Designed for live studies, not mockups
        </div>

        <h1 class="mt-6 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
          Sign into the workspace where study design, fieldwork, and data review stay aligned.
        </h1>
        <p class="mt-5 max-w-lg text-base leading-8 text-slate-300 xl:text-lg">
          The auth experience now matches the product ambition: stronger hierarchy, better framing,
          and a clearer explanation of what the platform is actually for.
        </p>
      </div>

      <div class="relative mt-10 grid gap-4 sm:grid-cols-3">
        {#each authStats as stat}
          <div class="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur">
            <p class="text-2xl font-semibold tracking-tight text-white">{stat.value}</p>
            <p class="mt-2 text-sm leading-6 text-slate-300">{stat.label}</p>
          </div>
        {/each}
      </div>

      <div class="relative mt-8 grid gap-4 sm:grid-cols-2">
        {#each authHighlights as highlight}
          <div class="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div class="flex items-center gap-3">
              <div class="rounded-2xl bg-white/10 p-3">
                <highlight.icon class="h-5 w-5 text-white" />
              </div>
              <p class="font-semibold text-white">{highlight.title}</p>
            </div>
            <p class="mt-4 text-sm leading-6 text-slate-300">{highlight.description}</p>
          </div>
        {/each}
      </div>

      <div
        class="relative mt-auto rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur"
      >
        <div class="flex items-start gap-4">
          <div class="rounded-2xl bg-emerald-400/15 p-3">
            <ShieldCheck class="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <p class="text-lg font-semibold text-white">Research-ready sign in</p>
            <p class="mt-2 text-sm leading-6 text-slate-300">
              Access live studies, version history, and export context from the same workspace. The
              UI sets expectations immediately instead of dropping users into an empty form.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="flex items-center justify-center">
      <div
        class="w-full max-w-xl rounded-[32px] border border-border/80 bg-card/95 p-6 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-card/90 dark:shadow-black/50 sm:p-8"
      >
        <div class="mb-8 flex items-center justify-between gap-4">
          <a href="/" class="inline-flex items-center gap-3 lg:hidden">
            <div
              class="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950"
            >
              <svg class="h-6 w-6" viewBox="0 0 32 32" fill="currentColor">
                <path d="M16 2L2 9v14l14 7 14-7V9L16 2zm0 4l8 4v8l-8 4-8-4V10l8-4z" />
              </svg>
            </div>
            <div>
              <p
                class="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground"
              >
                QDesigner
              </p>
              <p class="text-sm text-muted-foreground">Research workspace</p>
            </div>
          </a>

          <div
            class="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground dark:border-white/10 dark:bg-white/5"
          >
            Access
          </div>
        </div>

        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Workspace sign in
          </p>
          <h2
            class="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            {m.auth_login_title()}
          </h2>
          <p class="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            Continue to active studies, quota monitoring, and version-aware exports from one place.
          </p>
        </div>

        <form class="mt-8 space-y-5" onsubmit={handleSignIn}>
          <FormGroup label={m.auth_login_email()} id="email">
            <Input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              bind:value={email}
              placeholder="Enter your email"
              class="h-12 rounded-xl border border-border/80 bg-card/80 px-4 shadow-none dark:border-white/10 dark:bg-white/5"
            />
          </FormGroup>

          <div>
            <FormGroup id="password">
              {#snippet labelSnippet()}
                <div class="flex w-full items-center justify-between">
                  <span>{m.auth_login_password()}</span>
                  <a
                    href="/forgot-password"
                    class="text-sm font-semibold text-primary hover:text-primary/80"
                  >
                    {m.auth_login_forgot()}
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
                class="h-12 rounded-xl border border-border/80 bg-card/80 px-4 shadow-none dark:border-white/10 dark:bg-white/5"
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

          <div class="grid gap-3 sm:grid-cols-2">
            <div
              class="rounded-2xl border border-border bg-muted/80 p-4 dark:border-white/10 dark:bg-white/5"
            >
              <div
                class="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <Clock class="h-4 w-4 text-sky-500 dark:text-sky-300" />
                Fast return to active work
              </div>
              <p class="mt-2 text-xs leading-6 text-muted-foreground">
                Resume study reviews, live runs, and release checks without digging through menus.
              </p>
            </div>
            <div
              class="rounded-2xl border border-border bg-muted/80 p-4 dark:border-white/10 dark:bg-white/5"
            >
              <div
                class="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <ShieldCheck class="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                Safer operator flow
              </div>
              <p class="mt-2 text-xs leading-6 text-muted-foreground">
                Release context, permissions, and audit history stay close to the work.
              </p>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            class="h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/20"
            {loading}
          >
            {m.auth_login_submit()}
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>

          {#if showDevQuickLogin}
            <div
              class="rounded-[24px] border border-warning/40 bg-warning/10 p-4 shadow-sm shadow-warning/10 dark:border-warning/30 dark:shadow-transparent"
              data-testid="dev-quick-login-panel"
            >
              <div class="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p
                    class="text-xs font-semibold uppercase tracking-[0.24em] text-warning"
                  >
                    Dev quick login
                  </p>
                  <p class="mt-1 text-xs text-warning">
                    Jump into seeded accounts while working locally.
                  </p>
                </div>
                <span
                  class="rounded-full bg-warning/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-warning"
                >
                  Dev only
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2">
                {#each devQuickLoginPersonas as persona}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="justify-start rounded-xl border border-warning/40 bg-card/70 px-3 text-warning hover:bg-card dark:border-warning/20 dark:bg-white/5 dark:hover:bg-white/10"
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

          <div class="pt-2">
            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-border dark:border-white/10"></div>
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="bg-card px-3 text-muted-foreground">
                  Or
                </span>
              </div>
            </div>

            <div class="mt-5">
              <Button
                href={signupHref}
                variant="secondary"
                size="lg"
                class="h-12 w-full rounded-xl text-base font-semibold"
              >
                {m.auth_signup_submit()}
              </Button>
            </div>
          </div>
        </form>

        <div
          class="mt-6 flex items-center gap-2 text-xs leading-6 text-muted-foreground"
        >
          <div
            class="flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success"
          >
            <Check class="h-4 w-4" />
          </div>
          Study versions, review notes, and export metadata remain connected after sign in.
        </div>

        <p class="mt-8 text-center text-sm text-muted-foreground">
          By signing in, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </section>
  </div>
</div>
