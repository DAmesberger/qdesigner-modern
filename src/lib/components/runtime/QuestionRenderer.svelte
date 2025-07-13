<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Question } from '$lib/shared';
  
  // Question type components
  import TextDisplayQuestion from '../questions/TextDisplayQuestion.svelte';
  import MultipleChoiceQuestion from '../questions/MultipleChoiceQuestion.svelte';
  import ScaleQuestion from '../questions/ScaleQuestion.svelte';
  import TextInputQuestion from '../questions/TextInputQuestion.svelte';
  import MatrixQuestion from '../questions/MatrixQuestion.svelte';
  import StatisticalFeedbackQuestion from '../questions/StatisticalFeedbackQuestion.svelte';
  
  export let question: Question;
  export let value: any = undefined;
  export let variables: Record<string, any> = {};
  export let interactive: boolean = true;
  export let showValidation: boolean = false;
  
  const dispatch = createEventDispatcher();
  
  // Map question types to components
  const questionComponents = {
    'text-display': TextDisplayQuestion,
    'multiple-choice': MultipleChoiceQuestion,
    'scale': ScaleQuestion,
    'text-input': TextInputQuestion,
    'matrix': MatrixQuestion,
    'statistical-feedback': StatisticalFeedbackQuestion
  };
  
  // Get the appropriate component
  $: component = questionComponents[question.type];
  
  // Handle response
  function handleResponse(event: CustomEvent) {
    if (interactive) {
      dispatch('response', event.detail);
    }
  }
  
  // Validate response
  function validate(): boolean {
    if (!question.validation) return true;
    
    for (const rule of question.validation) {
      switch (rule.type) {
        case 'required':
          if (!value || (Array.isArray(value) && value.length === 0)) {
            return false;
          }
          break;
        case 'minLength':
          if (typeof value === 'string' && value.length < rule.value) {
            return false;
          }
          break;
        case 'maxLength':
          if (typeof value === 'string' && value.length > rule.value) {
            return false;
          }
          break;
        case 'pattern':
          if (typeof value === 'string' && !new RegExp(rule.value).test(value)) {
            return false;
          }
          break;
        case 'min':
          if (typeof value === 'number' && value < rule.value) {
            return false;
          }
          break;
        case 'max':
          if (typeof value === 'number' && value > rule.value) {
            return false;
          }
          break;
      }
    }
    
    return true;
  }
  
  // Interpolate template strings
  function interpolateTemplate(template: string): string {
    if (!template) return '';
    
    // Replace variable references
    return template.replace(/\${([^}]+)}/g, (match, expression) => {
      try {
        // Create a safe evaluation context
        const context = { ...variables };
        const func = new Function(...Object.keys(context), `return ${expression}`);
        const result = func(...Object.values(context));
        return String(result);
      } catch (e) {
        console.error('Template interpolation error:', e);
        return match;
      }
    });
  }
  
  $: interpolatedTitle = question.content?.title ? interpolateTemplate(question.content.title) : '';
  $: interpolatedText = question.content?.text ? interpolateTemplate(question.content.text) : '';
  $: interpolatedHelpText = question.content?.helpText ? interpolateTemplate(question.content.helpText) : '';
  $: isValid = validate();
</script>

{#if component}
  <div class="question-renderer" class:invalid={showValidation && !isValid}>
    {#if interpolatedTitle}
      <h3 class="question-title">{interpolatedTitle}</h3>
    {/if}
    
    {#if interpolatedText}
      <div class="question-text">{@html interpolatedText}</div>
    {/if}
    
    <div class="question-component">
      <svelte:component
        this={component}
        {question}
        {value}
        {variables}
        {interactive}
        on:response={handleResponse}
      />
    </div>
    
    {#if interpolatedHelpText}
      <p class="question-help">{interpolatedHelpText}</p>
    {/if}
    
    {#if showValidation && !isValid}
      <p class="validation-error">
        {#if question.validation?.find(r => r.type === 'required')}
          This question is required
        {:else}
          Please provide a valid response
        {/if}
      </p>
    {/if}
  </div>
{:else}
  <div class="unknown-question-type">
    <p>Unknown question type: {question.type}</p>
  </div>
{/if}

<style>
  .question-renderer {
    padding: 1.5rem;
    background: white;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
    transition: all 150ms;
  }
  
  .question-renderer.invalid {
    border-color: #ef4444;
  }
  
  .question-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
  }
  
  .question-text {
    color: #374151;
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  
  .question-component {
    margin: 1rem 0;
  }
  
  .question-help {
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.5rem;
  }
  
  .validation-error {
    font-size: 0.875rem;
    color: #ef4444;
    margin-top: 0.5rem;
  }
  
  .unknown-question-type {
    padding: 2rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    color: #dc2626;
    text-align: center;
  }
</style>