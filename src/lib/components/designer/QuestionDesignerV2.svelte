<script lang="ts">
  import type { Question } from '$lib/shared/types/questionnaire';
  import { getDesignerComponent } from './questions';
  
  interface Props {
    question: Question;
    onChange: (question: Question) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  $: Component = getDesignerComponent(question.type);
</script>

<div class="question-designer">
  {#if Component}
    <Component {question} {onChange} />
  {:else}
    <div class="unsupported-type">
      <h3>Unsupported Question Type</h3>
      <p>The designer for "{question.type}" questions is not yet implemented.</p>
      <p class="type-info">Question ID: {question.id}</p>
      
      <div class="basic-editor">
        <h4>Basic Properties</h4>
        
        <div class="form-group">
          <label for="required">Required</label>
          <input
            id="required"
            type="checkbox"
            checked={question.required}
            onchange={(e) => onChange({
              ...question,
              required: e.currentTarget.checked
            })}
          />
        </div>
        
        <div class="form-group">
          <label for="order">Order</label>
          <input
            id="order"
            type="number"
            value={question.order}
            min="0"
            oninput={(e) => onChange({
              ...question,
              order: Number(e.currentTarget.value)
            })}
          />
        </div>
        
        {#if question.name !== undefined}
          <div class="form-group">
            <label for="name">Internal Name</label>
            <input
              id="name"
              type="text"
              value={question.name || ''}
              oninput={(e) => onChange({
                ...question,
                name: e.currentTarget.value
              })}
              placeholder="Optional internal identifier"
            />
          </div>
        {/if}
      </div>
      
      <div class="json-preview">
        <h4>Raw Configuration</h4>
        <pre>{JSON.stringify(question, null, 2)}</pre>
      </div>
    </div>
  {/if}
</div>

<style>
  .question-designer {
    width: 100%;
    height: 100%;
    overflow-y: auto;
  }
  
  .unsupported-type {
    padding: 2rem;
    background-color: #fef3c7;
    border: 1px solid #fbbf24;
    border-radius: 0.5rem;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .unsupported-type h3 {
    margin: 0 0 0.5rem;
    color: #92400e;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  .unsupported-type p {
    margin: 0 0 0.5rem;
    color: #78350f;
  }
  
  .type-info {
    font-size: 0.875rem;
    font-family: monospace;
    background-color: rgba(0, 0, 0, 0.05);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    display: inline-block;
  }
  
  .basic-editor {
    margin-top: 2rem;
    padding: 1rem;
    background-color: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  
  .basic-editor h4 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
  }
  
  .form-group {
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .form-group:last-child {
    margin-bottom: 0;
  }
  
  .form-group label {
    min-width: 120px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #4b5563;
  }
  
  .form-group input[type="text"],
  .form-group input[type="number"] {
    flex: 1;
    padding: 0.375rem 0.5rem;
    font-size: 0.875rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
  }
  
  .form-group input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }
  
  .json-preview {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #1f2937;
    border-radius: 0.375rem;
    overflow-x: auto;
  }
  
  .json-preview h4 {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #d1d5db;
  }
  
  .json-preview pre {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: #e5e7eb;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }
</style>