<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink';
    size?: 'sm' | 'md';
    dot?: boolean;
    children?: Snippet;
  }

  let {
    variant = 'gray',
    size = 'md',
    dot = false,
    children,
  }: Props = $props();

  const variantClasses = {
    gray: 'bg-muted text-muted-foreground ring-border',
    red: 'bg-destructive/10 text-destructive ring-destructive/20',
    yellow: 'bg-warning/10 text-warning ring-warning/20',
    green: 'bg-success/10 text-success ring-success/20',
    blue: 'bg-info/10 text-info ring-info/20',
    indigo: 'bg-primary/10 text-primary ring-primary/20',
    purple: 'bg-purple-50 text-purple-700 ring-purple-700/10 dark:bg-purple-900/10 dark:text-purple-400 dark:ring-purple-400/20',
    pink: 'bg-pink-50 text-pink-700 ring-pink-700/10 dark:bg-pink-900/10 dark:text-pink-400 dark:ring-pink-400/20',
  };

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
  };

  const dotColors = {
    gray: 'fill-muted-foreground',
    red: 'fill-destructive',
    yellow: 'fill-warning',
    green: 'fill-success',
    blue: 'fill-info',
    indigo: 'fill-primary',
    purple: 'fill-purple-500 dark:fill-purple-400',
    pink: 'fill-pink-500 dark:fill-pink-400',
  };
</script>

<span class="inline-flex items-center rounded-md font-medium ring-1 ring-inset {variantClasses[variant]} {sizeClasses[size]}">
  {#if dot}
    <svg class="{size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5'} {dotColors[variant]} {size === 'sm' ? 'mr-1' : 'mr-1.5'}" viewBox="0 0 6 6" aria-hidden="true">
      <circle cx="3" cy="3" r="3" />
    </svg>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</span>
