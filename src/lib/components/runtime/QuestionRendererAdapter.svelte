<script lang="ts">
  import type { Question as OldQuestion } from '$lib/shared/types/questionnaire';
  import type { Question as NewQuestion } from '$lib/shared/types/questionnaire';
  import { migrateQuestion } from '$lib/shared/migration/question-migration';
  import QuestionRendererV2 from './QuestionRendererV2.svelte';
  import QuestionRenderer from './QuestionRenderer.svelte';
  
  interface Props {
    question: OldQuestion | NewQuestion;
    value?: any;
    onChange?: (value: any) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    disabled?: boolean;
    showValidation?: boolean;
    mode?: 'design' | 'preview' | 'runtime';
  }
  
  let {
    question,
    value = $bindable(),
    onChange,
    onNext,
    onPrevious,
    disabled = false,
    showValidation = false,
    mode = 'runtime'
  }: Props = $props();
  
  // Check if this is a new question format
  function isNewQuestion(q: OldQuestion | NewQuestion): q is NewQuestion {
    // New questions have display/response configs, old ones don't
    return 'display' in q || 'response' in q;
  }
  
  // Convert old question to new format if needed
  let processedQuestion = $derived(() => {
    if (isNewQuestion(question)) {
      return { isNew: true, question };
    } else {
      const migrationResult = migrateQuestion(question);
      if (migrationResult.success && migrationResult.question) {
        if (migrationResult.warnings.length > 0) {
          console.warn(`Migration warnings for question ${question.id}:`, migrationResult.warnings);
        }
        return { isNew: true, question: migrationResult.question };
      } else {
        console.error(`Failed to migrate question ${question.id}:`, migrationResult.errors);
        return { isNew: false, question };
      }
    }
  });
</script>

{#if processedQuestion().isNew}
  <QuestionRendererV2
    question={processedQuestion().question as NewQuestion}
    bind:value
    {onChange}
    {onNext}
    {onPrevious}
    {disabled}
    {showValidation}
  />
{:else}
  <!-- Fallback to old renderer -->
  <QuestionRenderer
    {question}
    bind:value
    onChange={(v) => {
      value = v;
      onChange?.(v);
    }}
    {onNext}
    {disabled}
    {mode}
  />
{/if}