<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';
  import { AlertTriangle } from 'lucide-svelte';

  interface Props {
    error?: Error | null;
    reset?: (() => void) | null;
    children?: Snippet;
  }

  let {
    error = $bindable(null),
    reset = null,
    children,
  }: Props = $props();

  let showDetails = $state(false);

  // Capture errors
  onMount(() => {
    const handleError = (event: ErrorEvent) => {
      error = event.error;
      event.preventDefault();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      error = new Error(event.reason);
      event.preventDefault();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  });

  function handleReset() {
    error = null;
    showDetails = false;
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  }

  function reportError() {
    // In production, this would send to an error tracking service
    console.error('Error reported:', error);
  }
</script>

{#if error}
  <div class="min-h-screen flex items-center justify-center bg-muted py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div class="text-center">
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10">
          <AlertTriangle size={24} class="text-destructive" />
        </div>

        <h2 class="mt-6 text-3xl font-extrabold text-foreground">Oops! Something went wrong</h2>

        <p class="mt-2 text-sm text-muted-foreground">
          We're sorry for the inconvenience. The error has been logged and we'll look into it.
        </p>
      </div>

      <div class="mt-8 space-y-6">
        {#if error.message}
          <div class="rounded-md bg-destructive/10 p-4">
            <div class="flex">
              <div class="ml-3">
                <h3 class="text-sm font-medium text-destructive">Error details</h3>
                <div class="mt-2 text-sm text-destructive/80">
                  <p>{error.message}</p>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="flex space-x-3">
          <Button onclick={handleReset} variant="primary" class="flex-1">Try Again</Button>

          <Button onclick={() => (window.location.href = '/')} variant="secondary" class="flex-1">
            Go Home
          </Button>
        </div>

        <div class="text-center">
          <button
            onclick={() => (showDetails = !showDetails)}
            class="text-sm text-muted-foreground hover:text-foreground"
          >
            {showDetails ? 'Hide' : 'Show'} technical details
          </button>
        </div>

        {#if showDetails && error}
          <div class="rounded-md bg-muted p-4">
            <pre class="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
{error.stack || error.toString()}
            </pre>
          </div>

          <div class="text-center">
            <button onclick={reportError} class="text-sm text-primary hover:text-primary/80">
              Report this error
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{:else if children}
  {@render children()}
{/if}
