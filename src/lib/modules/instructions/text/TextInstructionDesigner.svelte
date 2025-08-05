<script lang="ts">
  import type { InstructionProps } from '$lib/modules/types';
  import FormulaEditor from '$lib/components/designer/FormulaEditor.svelte';
  
  interface Props extends InstructionProps {
    instruction: any;
  }
  
  let { instruction, onUpdate }: Props = $props();
  
  function handleContentChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    onUpdate?.({ content: target.value });
  }
  
  function handleMarkdownToggle() {
    onUpdate?.({ markdown: !instruction.markdown });
  }
  
  function handleVariablesToggle() {
    onUpdate?.({ variables: !instruction.variables });
  }
  
  function handleInteractiveToggle() {
    onUpdate?.({ interactive: !instruction.interactive });
  }
  
  function handleAutoAdvanceToggle() {
    onUpdate?.({
      autoAdvance: {
        ...instruction.autoAdvance,
        enabled: !instruction.autoAdvance?.enabled
      }
    });
  }
  
  function handleDelayChange(event: Event) {
    const target = event.target as HTMLInputElement;
    onUpdate?.({
      autoAdvance: {
        ...instruction.autoAdvance,
        delay: parseInt(target.value) * 1000
      }
    });
  }
</script>

<div class="text-instruction-designer">
  <div class="form-group">
    <label for="content">Content</label>
    <textarea
      id="content"
      value={instruction.content || ''}
      on:input={handleContentChange}
      rows="10"
      placeholder="Enter your instruction text here..."
      class="content-input"
    />
    {#if instruction.variables}
      <div class="help-text">
        You can use variables with the syntax: ${'{'}variableName{'}'}
      </div>
    {/if}
  </div>
  
  <div class="options-section">
    <h3>Display Options</h3>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.markdown ?? true}
          on:change={handleMarkdownToggle}
        />
        <span>Enable Markdown</span>
      </label>
      <div class="help-text">Parse content as Markdown for rich formatting</div>
    </div>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.variables ?? true}
          on:change={handleVariablesToggle}
        />
        <span>Enable Variables</span>
      </label>
      <div class="help-text">Allow variable interpolation in content</div>
    </div>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.interactive ?? true}
          on:change={handleInteractiveToggle}
        />
        <span>Interactive</span>
      </label>
      <div class="help-text">Require user to click Continue button</div>
    </div>
  </div>
  
  <div class="auto-advance-section">
    <h3>Auto-Advance</h3>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          checked={instruction.autoAdvance?.enabled ?? false}
          on:change={handleAutoAdvanceToggle}
        />
        <span>Enable Auto-Advance</span>
      </label>
    </div>
    
    {#if instruction.autoAdvance?.enabled}
      <div class="form-group">
        <label for="delay">Delay (seconds)</label>
        <input
          id="delay"
          type="number"
          min="1"
          max="300"
          value={(instruction.autoAdvance?.delay || 5000) / 1000}
          on:input={handleDelayChange}
          class="delay-input"
        />
      </div>
    {/if}
  </div>
  
  {#if instruction.markdown}
    <div class="markdown-reference">
      <h3>Markdown Reference</h3>
      <div class="reference-content">
        <div class="reference-item">
          <code># Heading 1</code>
          <code>## Heading 2</code>
          <code>### Heading 3</code>
        </div>
        <div class="reference-item">
          <code>**Bold Text**</code>
          <code>*Italic Text*</code>
          <code>`Code`</code>
        </div>
        <div class="reference-item">
          <code>- List Item</code>
          <code>1. Numbered Item</code>
          <code>[Link](url)</code>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .text-instruction-designer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }
  
  .content-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    resize: vertical;
  }
  
  .content-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .options-section,
  .auto-advance-section {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
  }
  
  h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.75rem;
  }
  
  .checkbox-group {
    margin-bottom: 0.75rem;
  }
  
  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  .checkbox-group input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }
  
  .help-text {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.25rem;
    margin-left: 1.5rem;
  }
  
  .delay-input {
    width: 120px;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  
  .delay-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .markdown-reference {
    background: #f3f4f6;
    padding: 1rem;
    border-radius: 0.5rem;
  }
  
  .reference-content {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }
  
  .reference-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .reference-item code {
    font-size: 0.75rem;
    background: #e5e7eb;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }
</style>