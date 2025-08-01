<script lang="ts">
  import { page } from '$app/stores';
  import theme from '$lib/theme';
  
  let status = $derived($page.status);
  let message = $derived($page.error?.message || 'An unexpected error occurred');
</script>

<div class="min-h-screen flex items-center justify-center bg-layer-base">
  <div class="text-center px-4">
    <h1 class="{theme.typography.h1} {theme.semantic.textPrimary} mb-4">
      {status}
    </h1>
    <p class="{theme.typography.body} {theme.semantic.textSecondary} mb-8 max-w-md mx-auto">
      {message}
    </p>
    
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/" class="{theme.components.button.variants.default} {theme.components.button.sizes.md} rounded-md">
        Go to Home
      </a>
      <a href="/login" class="{theme.components.button.variants.outline} {theme.components.button.sizes.md} rounded-md">
        Go to Login
      </a>
    </div>
  </div>
</div>