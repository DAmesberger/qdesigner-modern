<script lang="ts">
  interface Props {
    prompt: string;
    instruction?: string;
    required?: boolean;
    class?: string;
  }
  
  let {
    prompt,
    instruction,
    required = false,
    class: className = ''
  }: Props = $props();
</script>

<header class="question-header {className}">
  <h3 class="question-prompt">
    {prompt}
    {#if required}
      <span class="required-indicator" aria-label="Required">*</span>
    {/if}
  </h3>
  
  {#if instruction}
    <p class="question-instruction">{instruction}</p>
  {/if}
</header>

<style>
  .question-header {
    margin-bottom: 1rem;
  }
  
  .question-prompt {
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.75rem;
    color: var(--text-primary, #111827);
    margin: 0;
  }
  
  .required-indicator {
    color: #ef4444;
    margin-left: 0.25rem;
    font-weight: 400;
  }
  
  .question-instruction {
    margin-top: 0.25rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--text-secondary, #6b7280);
  }
</style>