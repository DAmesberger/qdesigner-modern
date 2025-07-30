<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import Button from './Button.svelte';
  
  export let error: Error | null = null;
  export let reset: (() => void) | null = null;
  
  let showDetails = false;
  
  // Capture errors
  onMount(() => {
    const handleError = (event: ErrorEvent) => {
      error = event.error;
      event.preventDefault();
    };
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      error = new Error(event.reason);
      event.preventDefault();
    };
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  });
  
  function handleReset() {
    error = null;
    showDetails = false;
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  }
  
  function reportError() {
    // In production, this would send to an error tracking service
    console.error('Error reported:', error);
    // Could integrate with Sentry, LogRocket, etc.
  }
</script>

{#if error}
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div class="text-center">
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
          <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900">
          Oops! Something went wrong
        </h2>
        
        <p class="mt-2 text-sm text-gray-600">
          We're sorry for the inconvenience. The error has been logged and we'll look into it.
        </p>
      </div>
      
      <div class="mt-8 space-y-6">
        {#if error.message}
          <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">Error details</h3>
                <div class="mt-2 text-sm text-red-700">
                  <p>{error.message}</p>
                </div>
              </div>
            </div>
          </div>
        {/if}
        
        <div class="flex space-x-3">
          <Button on:click={handleReset} variant="primary" class="flex-1">
            Try Again
          </Button>
          
          <Button on:click={() => window.location.href = '/'} variant="secondary" class="flex-1">
            Go Home
          </Button>
        </div>
        
        <div class="text-center">
          <button
            on:click={() => showDetails = !showDetails}
            class="text-sm text-gray-500 hover:text-gray-700"
          >
            {showDetails ? 'Hide' : 'Show'} technical details
          </button>
        </div>
        
        {#if showDetails && error}
          <div class="rounded-md bg-gray-100 p-4">
            <pre class="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
{error.stack || error.toString()}
            </pre>
          </div>
          
          <div class="text-center">
            <button
              on:click={reportError}
              class="text-sm text-blue-600 hover:text-blue-500"
            >
              Report this error
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <slot />
{/if}