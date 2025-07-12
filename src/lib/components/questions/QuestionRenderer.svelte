<script lang="ts">
  import { getQuestionComponent } from './index';
  import type { ExtendedQuestion } from './types';
  
  export let question: ExtendedQuestion;
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: any = undefined;
  export let disabled: boolean = false;
  
  // Get the appropriate component for this question type
  $: QuestionComponent = getQuestionComponent(question.type);
  
  // Merge question properties with type-specific config
  $: fullQuestion = {
    ...question,
    config: {
      ...question.config,
      ...(question as any) // Type-specific properties
    }
  };
</script>

{#if QuestionComponent}
  <svelte:component 
    this={QuestionComponent}
    question={fullQuestion}
    {mode}
    bind:value
    {disabled}
    on:edit
    on:delete
    on:duplicate
    on:response
    on:interaction
    on:mount
    on:change
  />
{:else}
  <div class="unknown-question-type">
    <div class="error-icon">❓</div>
    <h3>Unknown Question Type</h3>
    <p>Question type "{question.type}" is not registered.</p>
    {#if mode === 'edit'}
      <p class="help-text">
        Please check that the question type is correctly configured
        or that the required component is installed.
      </p>
    {/if}
  </div>
{/if}

<style>
  .unknown-question-type {
    padding: 2rem;
    text-align: center;
    background: var(--color-gray-50);
    border: 2px dashed var(--color-gray-300);
    border-radius: 0.5rem;
  }
  
  .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .unknown-question-type h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-gray-900);
    margin-bottom: 0.5rem;
  }
  
  .unknown-question-type p {
    color: var(--color-gray-600);
    margin: 0;
  }
  
  .help-text {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-gray-500);
  }
</style>