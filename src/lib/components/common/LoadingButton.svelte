<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let variant: 'primary' | 'secondary' | 'danger' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let loading = false;
  export let disabled = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let fullWidth = false;
  export let loadingText = '';
  
  const dispatch = createEventDispatcher();
  
  $: isDisabled = disabled || loading;
  
  const variantClasses = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-600',
    secondary: 'bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600'
  };
  
  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };
  
  function handleClick(event: MouseEvent) {
    if (!isDisabled) {
      dispatch('click', event);
    }
  }
</script>

<button
  {type}
  {disabled}
  on:click={handleClick}
  class="
    inline-flex items-center justify-center rounded-md font-semibold
    shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
    transition-all duration-200
    {variantClasses[variant]}
    {sizeClasses[size]}
    {fullWidth ? 'w-full' : ''}
    {isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
  "
  class:relative={loading}
>
  {#if loading}
    <span class="absolute inset-0 flex items-center justify-center">
      <svg 
        class="animate-spin h-5 w-5 text-current" 
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24"
      >
        <circle 
          class="opacity-25" 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          stroke-width="4"
        />
        <path 
          class="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </span>
    {#if loadingText}
      <span class="opacity-0">{loadingText}</span>
    {:else}
      <span class="opacity-0"><slot /></span>
    {/if}
  {:else}
    <slot />
  {/if}
</button>