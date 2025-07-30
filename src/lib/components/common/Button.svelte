<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' | 'default' | 'outline' | 'destructive' = 'primary';
  export let size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let disabled = false;
  export let href: string | undefined = undefined;
  export let loading = false;
  
  const sizeClasses = {
    xs: 'h-7 rounded px-2 text-xs',
    sm: 'h-8 rounded px-3 text-xs',
    md: 'h-9 rounded-md px-4 text-sm',
    lg: 'h-10 rounded-md px-6 text-sm',
    xl: 'h-11 rounded-md px-8 text-base'
  };
  
  const variantClasses = {
    primary: 'bg-primary font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    secondary: 'bg-secondary font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80',
    ghost: 'font-medium hover:bg-accent hover:text-accent-foreground',
    default: 'bg-primary font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90'
  };
  
  $: classes = `inline-flex items-center justify-center transition-colors ${sizeClasses[size]} ${variantClasses[variant]} ${
    disabled || loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
  } ${$$props.class || ''}`;
</script>

{#if href && !disabled}
  <a {href} class={classes} on:click>
    {#if loading}
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {/if}
    <slot />
  </a>
{:else}
  <button {type} {disabled} class={classes} on:click>
    {#if loading}
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {/if}
    <slot />
  </button>
{/if}