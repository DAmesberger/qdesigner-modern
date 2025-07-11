<script lang="ts">
  export let open = false;
  export let size: 'sm' | 'md' | 'lg' | 'xl' | 'full' = 'md';
  export let title = '';
  
  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
    full: 'sm:max-w-7xl'
  };
  
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      open = false;
    }
  }
  
  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      open = false;
    }
  }
</script>

<svelte:window on:keydown={handleEscape} />

{#if open}
  <div class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" on:click={handleBackdropClick}></div>
    
    <div class="fixed inset-0 z-10 overflow-y-auto">
      <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full {sizeClasses[size]}">
          {#if title || $$slots.header}
            <div class="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
              <slot name="header">
                <h3 class="text-lg font-semibold leading-6 text-gray-900" id="modal-title">
                  {title}
                </h3>
              </slot>
            </div>
          {/if}
          
          <div class="px-4 py-3 sm:px-6">
            <slot />
          </div>
          
          {#if $$slots.footer}
            <div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
              <slot name="footer" />
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}