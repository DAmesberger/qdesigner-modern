<script lang="ts">
  import { designerStoreV2, selectedItem, currentPageQuestions } from '$lib/features/designer/stores/designerStoreV2';
  import QuestionDesignerV2 from '$lib/components/designer/QuestionDesignerV2.svelte';
  import QuestionRendererV2 from '$lib/components/runtime/QuestionRendererV2.svelte';
  import { QuestionTypes } from '$lib/shared/types/questions-v2';
  import type { Question } from '$lib/shared/types/questions-v2';
  
  let previewMode = $state(false);
  let currentQuestionIndex = $state(0);
  let responses = $state<Record<string, any>>({});
  
  // Initialize the store
  designerStoreV2.initVariableEngine();
  
  // Add some test questions
  function addTestQuestions() {
    const pageId = $designerStoreV2.currentPageId;
    if (!pageId) return;
    
    // Add different question types
    designerStoreV2.addQuestion(pageId, QuestionTypes.TEXT_DISPLAY);
    designerStoreV2.addQuestion(pageId, QuestionTypes.SINGLE_CHOICE);
    designerStoreV2.addQuestion(pageId, QuestionTypes.SCALE);
    designerStoreV2.addQuestion(pageId, QuestionTypes.TEXT_INPUT);
    designerStoreV2.addQuestion(pageId, QuestionTypes.MULTIPLE_CHOICE);
  }
  
  function handleQuestionUpdate(question: Question) {
    designerStoreV2.updateQuestion(question.id, question);
  }
  
  function handleNext() {
    if (currentQuestionIndex < $currentPageQuestions.length - 1) {
      currentQuestionIndex++;
    }
  }
  
  function handlePrevious() {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
    }
  }
  
  let currentQuestion = $derived($currentPageQuestions[currentQuestionIndex]);
</script>

<div class="test-container">
  <header class="test-header">
    <h1>QuestionRenderer V2 Test</h1>
    <div class="header-actions">
      <button onclick={() => addTestQuestions()}>
        Add Test Questions
      </button>
      <button onclick={() => previewMode = !previewMode}>
        {previewMode ? 'Edit Mode' : 'Preview Mode'}
      </button>
      <button onclick={() => designerStoreV2.validate()}>
        Validate
      </button>
    </div>
  </header>
  
  <div class="test-layout">
    <aside class="question-list">
      <h2>Questions ({$currentPageQuestions.length})</h2>
      {#each $currentPageQuestions as question, index}
        <button
          class="question-item"
          class:selected={$selectedItem?.id === question.id || (previewMode && index === currentQuestionIndex)}
          onclick={() => {
            if (previewMode) {
              currentQuestionIndex = index;
            } else {
              designerStoreV2.selectItem(question.id, 'question');
            }
          }}
        >
          <span class="question-type">{question.type}</span>
          <span class="question-id">{question.id}</span>
        </button>
      {/each}
      
      {#if $currentPageQuestions.length === 0}
        <p class="empty-state">No questions yet. Click "Add Test Questions" to start.</p>
      {/if}
    </aside>
    
    <main class="content-area">
      {#if previewMode}
        <div class="preview-container">
          <h2>Preview Mode</h2>
          {#if currentQuestion}
            <div class="preview-info">
              Question {currentQuestionIndex + 1} of {$currentPageQuestions.length}
            </div>
            <QuestionRendererV2
              question={currentQuestion}
              value={responses[currentQuestion.id]}
              onChange={(value) => {
                responses[currentQuestion.id] = value;
                console.log('Response updated:', currentQuestion.id, value);
              }}
              onNext={handleNext}
              onPrevious={handlePrevious}
              showValidation={true}
            />
          {:else}
            <p class="empty-state">No questions to preview</p>
          {/if}
        </div>
      {:else}
        <div class="designer-container">
          <h2>Designer Mode</h2>
          {#if $selectedItem && 'type' in $selectedItem}
            <QuestionDesignerV2
              question={$selectedItem as Question}
              onChange={handleQuestionUpdate}
            />
          {:else}
            <p class="empty-state">Select a question to edit</p>
          {/if}
        </div>
      {/if}
    </main>
    
    <aside class="info-panel">
      <h2>Validation</h2>
      {#if $designerStoreV2.validationErrors.length > 0}
        <div class="validation-errors">
          {#each $designerStoreV2.validationErrors as error}
            <div class="error-item">
              <strong>{error.itemType} {error.itemId}:</strong>
              {error.message}
            </div>
          {/each}
        </div>
      {:else}
        <p class="success">✅ No validation errors</p>
      {/if}
      
      <h2>Responses</h2>
      <pre class="response-data">{JSON.stringify(responses, null, 2)}</pre>
    </aside>
  </div>
</div>

<style>
  .test-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #f9fafb;
  }
  
  .test-header {
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 1rem 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .test-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #111827;
  }
  
  .header-actions {
    display: flex;
    gap: 1rem;
  }
  
  .header-actions button {
    padding: 0.5rem 1rem;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  
  .header-actions button:hover {
    background-color: #2563eb;
  }
  
  .test-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 250px 1fr 300px;
    gap: 1px;
    background-color: #e5e7eb;
    overflow: hidden;
  }
  
  .question-list,
  .content-area,
  .info-panel {
    background-color: white;
    overflow-y: auto;
  }
  
  .question-list {
    padding: 1rem;
  }
  
  .question-list h2,
  .content-area h2,
  .info-panel h2 {
    margin: 0 0 1rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #374151;
  }
  
  .question-item {
    width: 100%;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .question-item:hover {
    background-color: #f3f4f6;
    border-color: #d1d5db;
  }
  
  .question-item.selected {
    background-color: #eff6ff;
    border-color: #3b82f6;
  }
  
  .question-type {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
  }
  
  .question-id {
    font-size: 0.75rem;
    font-family: monospace;
    color: #9ca3af;
  }
  
  .content-area {
    padding: 2rem;
  }
  
  .preview-container,
  .designer-container {
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .preview-info {
    padding: 0.5rem 1rem;
    background-color: #f3f4f6;
    border-radius: 0.375rem;
    margin-bottom: 1rem;
    text-align: center;
    color: #6b7280;
    font-size: 0.875rem;
  }
  
  .info-panel {
    padding: 1rem;
  }
  
  .validation-errors {
    background-color: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
    padding: 0.75rem;
    font-size: 0.875rem;
  }
  
  .error-item {
    margin-bottom: 0.5rem;
    color: #991b1b;
  }
  
  .error-item:last-child {
    margin-bottom: 0;
  }
  
  .success {
    color: #059669;
    font-weight: 500;
  }
  
  .response-data {
    background-color: #1f2937;
    color: #e5e7eb;
    padding: 1rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    overflow-x: auto;
    margin: 0;
  }
  
  .empty-state {
    text-align: center;
    color: #9ca3af;
    padding: 2rem;
  }
</style>