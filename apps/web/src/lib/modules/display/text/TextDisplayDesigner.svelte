<script lang="ts">
  import type { Question } from '@qdesigner/questionnaire-core';
  import { buildModuleRuntimeConfig } from '$lib/runtime/core/moduleConfigAdapter';
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';
  import { Eye, Edit } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

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
    question: Question & { config?: TextDisplayConfig };
    onUpdate?: (updates: Record<string, unknown>) => void;
  }

  let { question, onUpdate }: Props = $props();
  const storedConfig = $derived(
    buildModuleRuntimeConfig(question) as unknown as Partial<TextDisplayConfig>
  );
  const config = $derived({
    content: '',
    markdown: true,
    variables: false,
    ...storedConfig,
    autoAdvance: { enabled: false, delay: 5000, ...storedConfig.autoAdvance },
    styling: { fontSize: '1rem', textAlign: 'left', fontWeight: 'normal', ...storedConfig.styling },
  } satisfies TextDisplayConfig);

  function updateField(key: 'content' | 'markdown' | 'variables', value: string | boolean) {
    if (question.config && Object.hasOwn(question.config, key)) {
      onUpdate?.({ config: { ...question.config, [key]: value } });
    } else if (
      key === 'markdown' &&
      question.config &&
      Object.hasOwn(question.config, 'enableMarkdown')
    ) {
      onUpdate?.({ config: { ...question.config, enableMarkdown: value } });
    } else {
      const field = key === 'markdown' ? 'enableMarkdown' : key;
      onUpdate?.({ display: { ...question.display, [field]: value } });
    }
  }

  function updateNested(
    key: 'styling' | 'autoAdvance',
    field: string,
    value: string | number | boolean
  ) {
    const display = question.display as unknown as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (key === 'styling' && !Object.hasOwn(question.config ?? {}, key) && display?.styling) {
      onUpdate?.({
        display: { ...question.display, styling: { ...display.styling, [field]: value } },
      });
      return;
    }
    const existing = (question.config ?? {}) as unknown as Record<string, Record<string, unknown>>;
    onUpdate?.({ config: { ...question.config, [key]: { ...existing[key], [field]: value } } });
  }

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
    let content = config.content || '';

    if (config.markdown) {
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
    updateField('content', config.content + '\n' + snippet);
  }
</script>

<div class="designer-panel">
  <!-- Content Editor -->
  <div class="form-group">
    <label for="content">Content</label>
    <div class="editor-toolbar">
      <Button
        variant={previewMode ? 'primary' : 'ghost'}
        size="sm"
        onclick={() => (previewMode = !previewMode)}
      >
        {#if previewMode}
          <Edit size={16} />
        {:else}
          <Eye size={16} />
        {/if}
        {previewMode ? 'Edit' : 'Preview'}
      </Button>

      {#if config.markdown && !previewMode}
        <div class="toolbar-divider"></div>
        {#each markdownSnippets as snippet}
          <Button
            variant="ghost"
            size="sm"
            onclick={() => insertSnippet(snippet.value)}
            aria-label={snippet.label}
          >
            {snippet.label}
          </Button>
        {/each}
      {/if}
    </div>

    {#if previewMode}
      <div
        class="preview-area"
        style="font-size: {config.styling!.fontSize}; text-align: {config.styling!.textAlign};"
      >
        {#if config.markdown}
          {@html processedPreview}
        {:else}
          {config.content}
        {/if}
      </div>
    {:else}
      <textarea
        id="content"
        value={config.content}
        oninput={(e) => updateField('content', e.currentTarget.value)}
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
        <input
          type="checkbox"
          checked={config.markdown}
          onchange={(e) => updateField('markdown', e.currentTarget.checked)}
          class="checkbox"
        />
        <span>Enable Markdown formatting</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={config.variables}
          onchange={(e) => updateField('variables', e.currentTarget.checked)}
          class="checkbox"
        />
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
        <Select
          id="font-size"
          value={config.styling!.fontSize}
          onchange={(e) => updateNested('styling', 'fontSize', e.currentTarget.value)}
        >
          <option value="0.75rem">Small (0.75rem)</option>
          <option value="0.875rem">Medium Small (0.875rem)</option>
          <option value="1rem">Normal (1rem)</option>
          <option value="1.125rem">Medium Large (1.125rem)</option>
          <option value="1.25rem">Large (1.25rem)</option>
          <option value="1.5rem">Extra Large (1.5rem)</option>
          <option value="2rem">Huge (2rem)</option>
        </Select>
      </div>

      <div class="form-group">
        <label for="text-align">Text Alignment</label>
        <Select
          id="text-align"
          value={config.styling!.textAlign}
          onchange={(e) => updateNested('styling', 'textAlign', e.currentTarget.value)}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </Select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="font-weight">Font Weight</label>
        <Select
          id="font-weight"
          value={config.styling!.fontWeight}
          onchange={(e) => updateNested('styling', 'fontWeight', e.currentTarget.value)}
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </Select>
      </div>

      <div class="form-group">
        <label for="color">Text Color</label>
        <input
          id="color"
          type="color"
          value={config.styling!.color}
          oninput={(e) => updateNested('styling', 'color', e.currentTarget.value)}
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
          value={config.styling!.backgroundColor}
          oninput={(e) => updateNested('styling', 'backgroundColor', e.currentTarget.value)}
          class="color-input"
        />
        <Button
          variant="secondary"
          size="sm"
          onclick={() => updateNested('styling', 'backgroundColor', '')}
        >
          Clear
        </Button>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="padding">Padding</label>
        <input
          id="padding"
          type="text"
          value={config.styling!.padding}
          oninput={(e) => updateNested('styling', 'padding', e.currentTarget.value)}
          placeholder="e.g., 1rem, 20px"
          class="input"
        />
      </div>

      <div class="form-group">
        <label for="border-radius">Border Radius</label>
        <input
          id="border-radius"
          type="text"
          value={config.styling!.borderRadius}
          oninput={(e) => updateNested('styling', 'borderRadius', e.currentTarget.value)}
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
          checked={config.autoAdvance!.enabled}
          onchange={(e) => updateNested('autoAdvance', 'enabled', e.currentTarget.checked)}
          class="checkbox"
        />
        <span>Automatically advance after delay</span>
      </label>
    </div>

    {#if config.autoAdvance?.enabled}
      <div class="form-group">
        <label for="advance-delay">Delay (seconds)</label>
        <input
          id="advance-delay"
          type="number"
          value={config.autoAdvance!.delay}
          oninput={(e) => updateNested('autoAdvance', 'delay', Number(e.currentTarget.value))}
          min="1000"
          step="1000"
          class="input"
        />
        <p class="help-text">Time in milliseconds before auto-advancing</p>
      </div>
    {/if}
  </div>

  <!-- Help Text -->
  {#if config.markdown}
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

  {#if config.variables}
    <div class="help-section">
      <h5 class="help-title">Variable Usage</h5>
      <p class="help-text">
        Use <code>{'{{variableName}}'}</code> to insert variable values. The
        <code>${'${variableName}'}</code> syntax is also accepted.
      </p>
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
    color: hsl(var(--foreground));
  }

  .input,
  .textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .textarea {
    resize: vertical;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .input:hover,
  .textarea:hover {
    border-color: hsl(var(--border));
  }

  .input:focus,
  .textarea:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
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
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem 0.375rem 0 0;
  }

  .toolbar-divider {
    width: 1px;
    height: 1.25rem;
    background: hsl(var(--border));
    margin: 0 0.5rem;
  }

  .preview-area {
    min-height: 15rem;
    padding: 1rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0 0 0.375rem 0.375rem;
    background: hsl(var(--background));
    overflow: auto;
  }

  .color-input {
    width: 3rem;
    height: 2rem;
    padding: 0.125rem;
    border: 1px solid hsl(var(--border));
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
    border-top: 1px solid hsl(var(--border));
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .help-section {
    margin-top: 1.5rem;
    padding: 1rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
  }

  .help-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .help-list {
    margin: 0;
    padding-left: 1.5rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .help-list li {
    margin: 0.25rem 0;
  }

  .help-list code {
    padding: 0.125rem 0.25rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 0.125rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }
</style>
