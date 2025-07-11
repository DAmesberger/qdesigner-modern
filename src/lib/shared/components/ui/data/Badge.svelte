<script lang="ts">
  export let variant: 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink' = 'gray';
  export let size: 'sm' | 'md' = 'md';
  export let dot = false;
  
  const variantClasses = {
    gray: 'bg-gray-50 text-gray-600 ring-gray-500/10',
    red: 'bg-red-50 text-red-700 ring-red-600/10',
    yellow: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
    green: 'bg-green-50 text-green-700 ring-green-600/20',
    blue: 'bg-blue-50 text-blue-700 ring-blue-700/10',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-700/10',
    purple: 'bg-purple-50 text-purple-700 ring-purple-700/10',
    pink: 'bg-pink-50 text-pink-700 ring-pink-700/10'
  };
  
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm'
  };
  
  const dotColors = {
    gray: 'fill-gray-500',
    red: 'fill-red-500',
    yellow: 'fill-yellow-500',
    green: 'fill-green-500',
    blue: 'fill-blue-500',
    indigo: 'fill-indigo-500',
    purple: 'fill-purple-500',
    pink: 'fill-pink-500'
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