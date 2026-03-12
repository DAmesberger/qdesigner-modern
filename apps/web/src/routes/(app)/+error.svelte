<script lang="ts">
  import { page } from '$app/stores';

  let status = $derived($page.status);
  let message = $derived($page.error?.message || '');

  let title = $derived(
    status === 403
      ? 'Access Denied'
      : status === 404
        ? 'Page Not Found'
        : status === 500
          ? 'Server Error'
          : `Error ${status}`
  );

  let description = $derived(
    status === 403
      ? "You don't have permission to access this page. Contact your organization admin if you believe this is a mistake."
      : status === 404
        ? "The page you're looking for doesn't exist or has been moved."
        : status === 500
          ? 'Something went wrong on our end. Please try again or contact support if the problem persists.'
          : message || 'An unexpected error occurred.'
  );

  function retry() {
    window.location.reload();
  }
</script>

<div class="flex flex-1 items-center justify-center p-8">
  <div class="w-full max-w-md text-center">
    <div class="mb-6">
      <span class="text-7xl font-extrabold tracking-tight text-muted-foreground/30">
        {status}
      </span>
    </div>

    <h1 class="text-2xl font-semibold tracking-tight text-foreground mb-3">
      {title}
    </h1>

    <p class="text-sm leading-6 text-muted-foreground mb-8">
      {description}
    </p>

    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a
        href="/dashboard"
        class="inline-flex items-center justify-center h-9 rounded-md px-4 text-sm font-medium bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Back to Dashboard
      </a>
      {#if status === 500}
        <button
          onclick={retry}
          class="inline-flex items-center justify-center h-9 rounded-md px-4 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          Try Again
        </button>
      {/if}
    </div>
  </div>
</div>
