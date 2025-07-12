<script lang="ts">
  export let variant: 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink' = 'gray';
  export let size: 'sm' | 'md' = 'md';
  export let dot = false;
  
  const variantClasses = {
    gray: 'bg-muted text-muted-foreground ring-border',
    red: 'bg-destructive/10 text-destructive ring-destructive/20',
    yellow: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-900/10 dark:text-yellow-400 dark:ring-yellow-400/20',
    green: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/10 dark:text-green-400 dark:ring-green-400/20',
    blue: 'bg-blue-50 text-blue-700 ring-blue-700/10 dark:bg-blue-900/10 dark:text-blue-400 dark:ring-blue-400/20',
    indigo: 'bg-primary/10 text-primary ring-primary/20',
    purple: 'bg-purple-50 text-purple-700 ring-purple-700/10 dark:bg-purple-900/10 dark:text-purple-400 dark:ring-purple-400/20',
    pink: 'bg-pink-50 text-pink-700 ring-pink-700/10 dark:bg-pink-900/10 dark:text-pink-400 dark:ring-pink-400/20'
  };
  
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm'
  };
  
  const dotColors = {
    gray: 'fill-muted-foreground',
    red: 'fill-destructive',
    yellow: 'fill-yellow-500 dark:fill-yellow-400',
    green: 'fill-green-500 dark:fill-green-400',
    blue: 'fill-blue-500 dark:fill-blue-400',
    indigo: 'fill-primary',
    purple: 'fill-purple-500 dark:fill-purple-400',
    pink: 'fill-pink-500 dark:fill-pink-400'
  };
</script>

<span class="inline-flex items-center rounded-md font-medium ring-1 ring-inset {variantClasses[variant]} {sizeClasses[size]}">
  {#if dot}
    <svg class="{size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5'} {dotColors[variant]} {size === 'sm' ? 'mr-1' : 'mr-1.5'}" viewBox="0 0 6 6" aria-hidden="true">
      <circle cx="3" cy="3" r="3" />
    </svg>
  {/if}
  <slot />
</span>