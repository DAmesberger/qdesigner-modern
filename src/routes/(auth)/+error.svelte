<script lang="ts">
  import { page } from '$app/stores';

  let status = $derived($page.status);
  let message = $derived($page.error?.message || '');

  let description = $derived(
    status === 401
      ? 'Your session has expired. Please sign in again.'
      : status === 403
        ? 'This action is not allowed. Please sign in with valid credentials.'
        : status === 404
          ? "The page you're looking for doesn't exist."
          : message || 'Something went wrong. Please try again.'
  );
</script>

<div class="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-background">
  <div class="sm:mx-auto sm:w-full sm:max-w-sm text-center">
    <div class="flex items-center justify-center gap-2 mb-6">
      <svg class="w-12 h-12 text-primary" viewBox="0 0 32 32" fill="currentColor">
        <path d="M16 2L2 9v14l14 7 14-7V9L16 2zm0 4l8 4v8l-8 4-8-4V10l8-4z" />
      </svg>
    </div>

    <span class="text-5xl font-extrabold tracking-tight text-muted-foreground/30">
      {status}
    </span>

    <p class="mt-4 text-sm leading-6 text-muted-foreground">
      {description}
    </p>

    <div class="mt-8">
      <a
        href="/login"
        class="inline-flex items-center justify-center h-10 w-full rounded-md px-6 text-sm font-medium bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Back to Sign In
      </a>
    </div>
  </div>
</div>
