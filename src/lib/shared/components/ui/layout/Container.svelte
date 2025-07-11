<script lang="ts">
  export let maxWidth: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '7xl' | 'full' = '7xl';
  export let padding = true;
  
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full'
  };
</script>

<div class="mx-auto {maxWidthClasses[maxWidth]} {padding ? 'px-4 sm:px-6 lg:px-8' : ''}">
  <slot />
</div>