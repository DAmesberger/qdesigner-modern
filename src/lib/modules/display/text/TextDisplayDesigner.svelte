<script lang="ts">
  import type { InstructionConfig } from '$lib/modules/types';
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';
  import { Eye, Edit } from 'lucide-svelte';

  interface TextDisplayConfig {
    content: string;
    markdown: boolean;
    variables: boolean;
    autoAdvance?: {
      enabled: boolean;
      delay: number;
    };
    styling?: {
      fontSize?: string;
      textAlign?: 'left' | 'center' | 'right' | 'justify';
      fontWeight?: 'normal' | 'bold';
      fontFamily?: string;
      color?: string;
      backgroundColor?: string;
      padding?: string;
      borderRadius?: string;
    };
  }

  interface Props {
    question: InstructionConfig & { config: TextDisplayConfig };
  }

  let { question = $bindable() }: Props = $props();

  let previewMode = $state(false);
  let processedPreview = $state('');

  // Configure marked
  marked.use({
    breaks: true,
    gfm: true,
  });

  // Preview processing
  $effect(() => {
    if (previewMode) {
      updatePreview();
    }
  });

  function updatePreview() {
    let content = question.config.content || '';

    if (question.config.markdown) {
      content = marked.parse(content) as string;
      content = DOMPurify.sanitize(content);
    }

    processedPreview = content;
  }

  // Common markdown snippets
  const markdownSnippets = [
    { label: 'Heading 1', value: '# ' },
    { label: 'Heading 2', value: '## ' },
    { label: 'Bold', value: '**bold**' },
    { label: 'Italic', value: '*italic*' },
    { label: 'List', value: '- Item 1\n- Item 2\n- Item 3' },
    { label: 'Link', value: '[text](https://example.com)' },
    { label: 'Code', value: '`code`' },
    { label: 'Quote', value: '> Quote' },
  ];

  function insertSnippet(snippet: string) {
    // In a real implementation, this would insert at cursor position
    question.config.content += '\n' + snippet;
  }

  // Initialize auto-advance if not set
  if (!question.config.autoAdvance) {
    question.config.autoAdvance = {
      enabled: false,
      delay: 5000,
    };
  }

  // Initialize styling if not set
  if (!question.config.styling) {
    question.config.styling = {
      fontSize: '1rem',
      textAlign: 'left',
      fontWeight: 'normal',
    };
  }
</script>

<div class="designer-panel">
  <!-- Content Editor -->
  <div class="form-group">
    <label for="content">Content</label>
    <div class="editor-toolbar">
      <button
        class="toolbar-btn"
        class:active={previewMode}
        onclick={() => (previewMode = !previewMode)}
      >
        {#if previewMode}
          <Edit size={16} />
        {:else}
          <Eye size={16} />
        {/if}
        {previewMode ? 'Edit' : 'Preview'}
      </button>

      {#if question.config.markdown && !previewMode}
        <div class="toolbar-divider"></div>
        {#each markdownSnippets as snippet}
          <button
            class="toolbar-btn"
            onclick={() => insertSnippet(snippet.value)}
            title={snippet.label}
          >
            {snippet.label}
          </button>
        {/each}
      {/if}
    </div>

    {#if previewMode}
      <div
        class="preview-area"
        style="font-size: {question.config.styling!.fontSize}; text-align: {question.config.styling!
          .textAlign};"
      >
        {#if question.config.markdown}
          {@html processedPreview}
        {:else}
          {question.config.content}
        {/if}
      </div>
    {:else}
      <textarea
        id="content"
        bind:value={question.config.content}
        placeholder="Enter your text content..."
        rows="10"
        class="textarea"
      ></textarea>
    {/if}
  </div>

  <!-- Content Options -->
  <div class="form-row">
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.markdown} class="checkbox" />
        <span>Enable Markdown formatting</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.variables} class="checkbox" />
        <span>Enable variable interpolation</span>
      </label>
    </div>
  </div>

  <!-- Text Styling -->
  <div class="section">
    <h4 class="section-title">Text Styling</h4>

    <div class="form-row">
      <div class="form-group">
        <label for="font-size">Font Size</label>
        <select id="font-size" bind:value={question.config.styling!.fontSize} class="select">
          <option value="0.75rem">Small (0.75rem)</option>
          <option value="0.875rem">Medium Small (0.875rem)</option>
          <option value="1rem">Normal (1rem)</option>
          <option value="1.125rem">Medium Large (1.125rem)</option>
          <option value="1.25rem">Large (1.25rem)</option>
          <option value="1.5rem">Extra Large (1.5rem)</option>
          <option value="2rem">Huge (2rem)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="text-align">Text Alignment</label>
        <select id="text-align" bind:value={question.config.styling!.textAlign} class="select">
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="font-weight">Font Weight</label>
        <select id="font-weight" bind:value={question.config.styling!.fontWeight} class="select">
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </select>
      </div>

      <div class="form-group">
        <label for="color">Text Color</label>
        <input
          id="color"
          type="color"
          bind:value={question.config.styling!.color}
          class="color-input"
        />
      </div>
    </div>

    <div class="form-group">
      <label for="bg-color">Background Color</label>
      <div class="color-input-wrapper">
        <input
          id="bg-color"
          type="color"
          bind:value={question.config.styling!.backgroundColor}
          class="color-input"
        />
        <button
          class="btn btn-secondary small"
          onclick={() => (question.config.styling!.backgroundColor = '')}
        >
          Clear
        </button>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="padding">Padding</label>
        <input
          id="padding"
          type="text"
          bind:value={question.config.styling!.padding}
          placeholder="e.g., 1rem, 20px"
          class="input"
        />
      </div>

      <div class="form-group">
        <label for="border-radius">Border Radius</label>
        <input
          id="border-radius"
          type="text"
          bind:value={question.config.styling!.borderRadius}
          placeholder="e.g., 0.5rem, 8px"
          class="input"
        />
      </div>
    </div>
  </div>

  <!-- Auto-advance -->
  <div class="section">
    <h4 class="section-title">Auto-advance</h4>

    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={question.config.autoAdvance!.enabled}
          class="checkbox"
        />
        <span>Automatically advance after delay</span>
      </label>
    </div>

    {#if question.config.autoAdvance?.enabled}
      <div class="form-group">
        <label for="advance-delay">Delay (seconds)</label>
        <input
          id="advance-delay"
          type="number"
          bind:value={question.config.autoAdvance!.delay}
          min="1000"
          step="1000"
          class="input"
        />
        <p class="help-text">Time in milliseconds before auto-advancing</p>
      </div>
    {/if}
  </div>

  <!-- Help Text -->
  {#if question.config.markdown}
    <div class="help-section">
      <h5 class="help-title">Markdown Reference</h5>
      <ul class="help-list">
        <li><code># Heading 1</code> - Main heading</li>
        <li><code>## Heading 2</code> - Subheading</li>
        <li><code>**bold**</code> - Bold text</li>
        <li><code>*italic*</code> - Italic text</li>
        <li><code>[link](url)</code> - Hyperlink</li>
        <li><code>- item</code> - Bullet list</li>
        <li><code>1. item</code> - Numbered list</li>
        <li><code>`code`</code> - Inline code</li>
        <li><code>> quote</code> - Blockquote</li>
      </ul>
    </div>
  {/if}

  {#if question.config.variables}
    <div class="help-section">
      <h5 class="help-title">Variable Usage</h5>
      <p class="help-text">Use <code>${'${variableName}'}</code> to insert variable values</p>
    </div>
  {/if}
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .input,
  .select,
  .textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }

  .textarea {
    resize: vertical;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .input:hover,
  .select:hover,
  .textarea:hover {
    border-color: #d1d5db;
  }

  .input:focus,
  .select:focus,
  .textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem 0.375rem 0 0;
  }

  .toolbar-btn {
    padding: 0.375rem 0.75rem;
    border: none;
    background: white;
    color: #374151;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .toolbar-btn:hover {
    background: #e5e7eb;
  }

  .toolbar-btn.active {
    background: #3b82f6;
    color: white;
  }

  .toolbar-divider {
    width: 1px;
    height: 1.25rem;
    background: #e5e7eb;
    margin: 0 0.5rem;
  }

  .preview-area {
    min-height: 15rem;
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0 0 0.375rem 0.375rem;
    background: white;
    overflow: auto;
  }

  .color-input {
    width: 3rem;
    height: 2rem;
    padding: 0.125rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .color-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .help-section {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }

  .help-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
  }

  .help-list {
    margin: 0;
    padding-left: 1.5rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .help-list li {
    margin: 0.25rem 0;
  }

  .help-list code {
    padding: 0.125rem 0.25rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.125rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover {
    background: #e5e7eb;
  }

  .btn.small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }
</style>
