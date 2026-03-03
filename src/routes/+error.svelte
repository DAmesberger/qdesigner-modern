<script lang="ts">
  import { page } from '$app/stores';

  let status = $derived($page.status);
  let message = $derived($page.error?.message || '');

  let title = $derived(
    status === 400
      ? 'Bad Request'
      : status === 401
        ? 'Unauthorized'
        : status === 403
          ? 'Forbidden'
          : status === 404
            ? 'Not Found'
            : status === 405
              ? 'Method Not Allowed'
              : status === 429
                ? 'Too Many Requests'
                : status === 500
                  ? 'Server Error'
                  : status === 502
                    ? 'Bad Gateway'
                    : status === 503
                      ? 'Service Unavailable'
                      : `Error ${status}`
  );

  let description = $derived(
    status === 400
      ? 'The request could not be understood. Please check the URL and try again.'
      : status === 401
        ? 'You need to sign in to access this page.'
        : status === 403
          ? "You don't have permission to access this resource."
          : status === 404
            ? "The page you're looking for doesn't exist or has been moved."
            : status === 429
              ? 'You have made too many requests. Please wait a moment and try again.'
              : status >= 500
                ? 'Something went wrong on our end. Please try again later.'
                : message || 'An unexpected error occurred.'
  );

  function retry() {
    window.location.reload();
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-background p-6">
  <div class="w-full max-w-md text-center">
    <div class="mb-6">
      <span class="text-8xl font-extrabold tracking-tight text-muted-foreground/20">
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
        href="/"
        class="inline-flex items-center justify-center h-9 rounded-md px-4 text-sm font-medium bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Go to Home
      </a>
      {#if status >= 500}
        <button
          onclick={retry}
          class="inline-flex items-center justify-center h-9 rounded-md px-4 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          Try Again
        </button>
      {/if}
      {#if status === 401}
        <a
          href="/login"
          class="inline-flex items-center justify-center h-9 rounded-md px-4 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          Sign In
        </a>
      {/if}
    </div>
  </div>
</div>
