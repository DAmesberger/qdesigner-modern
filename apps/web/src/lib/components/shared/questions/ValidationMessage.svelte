<script lang="ts">
  import type { ValidationError } from '$lib/shared/validators/question-validators';
  
  interface Props {
    errors?: ValidationError[];
    warnings?: ValidationError[];
    showField?: boolean;
    class?: string;
  }
  
  let {
    errors = [],
    warnings = [],
    showField = false,
    class: className = ''
  }: Props = $props();
  
  let hasErrors = $derived(errors.length > 0);
  let hasWarnings = $derived(warnings.length > 0);
  let hasMessages = $derived(hasErrors || hasWarnings);
</script>

{#if hasMessages}
  <div class="validation-messages {className}">
    {#if hasErrors}
      <div class="error-messages" role="alert" aria-live="assertive">
        {#each errors as error}
          <div class="message error">
            <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <span>
              {#if showField && error.field}
                <strong>{error.field}:</strong>
              {/if}
              {error.message}
            </span>
          </div>
        {/each}
      </div>
    {/if}
    
    {#if hasWarnings}
      <div class="warning-messages" role="status" aria-live="polite">
        {#each warnings as warning}
          <div class="message warning">
            <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <span>
              {#if showField && warning.field}
                <strong>{warning.field}:</strong>
              {/if}
              {warning.message}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .validation-messages {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .error-messages,
  .warning-messages {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .message {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
  
  .message.error {
    background-color: rgba(239, 68, 68, 0.1);
    color: rgb(153, 27, 27);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }
  
  .message.warning {
    background-color: rgba(245, 158, 11, 0.1);
    color: rgb(120, 53, 15);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }
  
  .icon {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    margin-top: 0.125rem;
  }
  
  strong {
    font-weight: 600;
  }
</style>