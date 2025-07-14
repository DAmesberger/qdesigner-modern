<script lang="ts">
  import type { SingleChoiceQuestion } from '$lib/shared/types/questionnaire';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import OptionList from '$lib/components/shared/questions/OptionList.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: SingleChoiceQuestion;
    value?: string;
    onChange?: (value: string) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    disabled?: boolean;
    showValidation?: boolean;
  }
  
  let {
    question,
    value = $bindable(),
    onChange,
    onNext,
    onPrevious,
    disabled = false,
    showValidation = false
  }: Props = $props();
  
  let otherValue = $state('');
  let touched = $state(false);
  
  let validation = $derived(
    showValidation && touched ? 
      QuestionValidator.validateQuestion({
        ...question,
        response: {
          ...question.response,
          saveAs: question.response.saveAs || 'temp'
        }
      }) : { valid: true, errors: [], warnings: [] }
  );
  
  let fieldErrors = $derived(
    validation.errors.filter(e => 
      !e.field.startsWith('response.') && !e.field.startsWith('display.')
    )
  );
  
  function handleChange(newValue: string | string[]) {
    touched = true;
    const stringValue = Array.isArray(newValue) ? newValue[0] : newValue;
    value = stringValue;
    
    if (question.response.trackChanges) {
      // TODO: Track change event
    }
    
    onChange?.(stringValue);
    
    if (question.navigation?.autoAdvance && stringValue && stringValue !== '__other__') {
      setTimeout(() => {
        onNext?.();
      }, question.navigation.advanceDelay || 500);
    }
  }
  
  function handleOtherChange(newValue: string) {
    otherValue = newValue;
    if (question.response.saveOtherAs) {
      // TODO: Save other value to variable
    }
  }
  
  function handleNext() {
    touched = true;
    if (!question.required || value) {
      onNext?.();
    }
  }
  
  // Keyboard navigation
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    
    const options = question.display.options;
    const currentIndex = options.findIndex(o => String(o.value) === value);
    
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        if (currentIndex > 0) {
          handleChange(String(options[currentIndex - 1].value));
        }
        break;
        
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        if (currentIndex < options.length - 1) {
          handleChange(String(options[currentIndex + 1].value));
        }
        break;
        
      case 'Enter':
        if (value) {
          event.preventDefault();
          handleNext();
        }
        break;
        
      default:
        // Check for hotkeys
        const option = options.find(o => 
          o.hotkey?.toLowerCase() === event.key.toLowerCase()
        );
        if (option) {
          event.preventDefault();
          handleChange(String(option.value));
        }
    }
  }
  
  // Performance optimization for 120+ FPS
  let rafId: number;
  
  function scheduleUpdate(fn: () => void) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(fn);
  }
  
  $effect(() => {
    if (question.display.randomizeOptions && !disabled) {
      // TODO: Implement option randomization on mount
    }
  });
</script>

<svelte:window on:keydown={handleKeyDown} />

<article class="single-choice-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction}
    required={question.required}
  />
  
  <div class="options-container">
    <OptionList
      options={question.display.options}
      bind:value
      layout={question.display.layout}
      columns={question.display.columns}
      multiselect={false}
      {disabled}
      onChange={handleChange}
      showOther={question.display.showOther}
      bind:otherValue
      onOtherChange={handleOtherChange}
    />
  </div>
  
  {#if showValidation && touched && !validation.valid}
    <ValidationMessage errors={fieldErrors} />
  {/if}
  
  <NavigationButtons
    config={question.navigation}
    canGoBack={!!onPrevious}
    canGoNext={!question.required || !!value}
    {onPrevious}
    onNext={handleNext}
    {disabled}
  />
</article>

<style>
  .single-choice-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .options-container {
    /* Optimize for performance */
    will-change: transform;
    contain: layout style paint;
  }
</style>