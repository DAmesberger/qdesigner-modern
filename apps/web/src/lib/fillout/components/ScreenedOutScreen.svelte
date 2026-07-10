<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import type { ScreenOutResult } from '$lib/fillout/services/ScreenerController';

  interface Props {
    /** Structured screen-out outcome carrying the author-configured message + redirect. */
    result: ScreenOutResult;
    onClose?: () => void;
  }

  let { result, onClose }: Props = $props();

  let redirectCountdown = $state(5);

  const redirectUrl = $derived(result.redirectUrl?.trim() || null);

  // Auto-redirect countdown (mirrors CompletionScreen): a panel screen-out URL sends
  // the participant back to the provider, but we still show the honest reason first.
  $effect(() => {
    const target = redirectUrl;
    if (!target) return;

    redirectCountdown = 5;
    const interval = setInterval(() => {
      redirectCountdown--;
      if (redirectCountdown <= 0) {
        clearInterval(interval);
        window.location.href = target;
      }
    }, 1000);

    return () => clearInterval(interval);
  });

  function handleClose() {
    if (onClose) {
      onClose();
    } else {
      window.location.href = '/';
    }
  }
</script>

<div
  class="min-h-screen flex flex-col items-center justify-center p-4 bg-background"
  data-testid="fillout-screened-out-screen"
>
  <Card class="screenout-card">
    <div class="p-8 text-center">
      <!-- Neutral (not-eligible) icon — deliberately NOT the success checkmark. -->
      <div class="w-16 h-16 mx-auto mb-6 text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-full h-full">
          <circle cx="12" cy="12" r="10" stroke-width="2" />
          <path d="M8 12h8" stroke-width="2" stroke-linecap="round" />
        </svg>
      </div>

      <h1
        class="text-3xl font-bold mb-4 text-foreground"
        data-testid="fillout-screened-out-title"
      >
        You're not eligible for this study
      </h1>

      <p class="text-lg text-muted-foreground mb-8 leading-relaxed">
        {result.message ||
          'Thank you for your interest. Based on your answers, you do not qualify to take part in this study. Your responses have not been recorded as a completion.'}
      </p>

      {#if redirectUrl}
        <div
          class="mb-6 p-4 bg-muted rounded-lg text-center"
          data-testid="fillout-screened-out-redirect"
        >
          <p class="text-sm text-foreground mb-2">
            Redirecting in {redirectCountdown} seconds...
          </p>
          <a href={redirectUrl} class="text-xs text-primary underline">
            Click here if not redirected automatically
          </a>
        </div>
      {/if}

      <div class="flex gap-4 justify-center mb-6">
        <Button variant="default" size="lg" onclick={handleClose}>
          {onClose ? 'Close' : 'Return Home'}
        </Button>
      </div>

      <p class="text-xs text-muted-foreground opacity-80">
        If you have any questions about this study, please contact the research team.
      </p>
    </div>
  </Card>
</div>

<style>
  :global(.screenout-card) {
    width: 100%;
    max-width: 600px;
  }
</style>
