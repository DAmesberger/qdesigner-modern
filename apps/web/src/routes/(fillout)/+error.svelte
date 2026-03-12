<script lang="ts">
  import { page } from '$app/stores';

  let status = $derived($page.status);

  let title = $derived(
    status === 404
      ? 'Questionnaire Unavailable'
      : status === 410
        ? 'Questionnaire Closed'
        : 'Something Went Wrong'
  );

  let description = $derived(
    status === 404
      ? 'This questionnaire is no longer available or the link may be incorrect. Please check the URL and try again.'
      : status === 410
        ? 'This questionnaire has been closed and is no longer accepting responses.'
        : 'We encountered an issue loading your session. Please try refreshing the page.'
  );
</script>

<div class="flex min-h-screen items-center justify-center p-6">
  <div class="w-full max-w-sm text-center">
    <div class="mb-8">
      <svg class="mx-auto h-16 w-16 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        {#if status === 404 || status === 410}
          <path d="M9 12h6M12 9v6" />
          <circle cx="12" cy="12" r="10" />
        {:else}
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="10" />
        {/if}
      </svg>
    </div>

    <h1 class="text-xl font-semibold tracking-tight text-foreground mb-3">
      {title}
    </h1>

    <p class="text-sm leading-6 text-muted-foreground mb-8">
      {description}
    </p>

    <p class="text-xs text-muted-foreground/60">
      If the problem persists, please contact the researcher who shared this link.
    </p>
  </div>
</div>
