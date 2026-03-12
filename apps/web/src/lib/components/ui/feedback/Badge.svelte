<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
    size?: 'sm' | 'md' | 'lg';
    label?: string;
    children?: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    label = '',
    children,
  }: Props = $props();

  const variantClasses = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    secondary: 'bg-secondary/10 text-secondary-foreground border-secondary/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20',
    info: 'bg-info/10 text-info border-info/20',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  let classes = $derived(`
    inline-flex items-center font-medium rounded-full border
    ${variantClasses[variant]}
    ${sizeClasses[size]}
  `);
</script>

<span class={classes}>
  {#if children}
    {@render children()}
  {:else}
    {label}
  {/if}
</span>
