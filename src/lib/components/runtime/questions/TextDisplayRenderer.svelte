<script lang="ts">
  import type { TextDisplayQuestion } from '$lib/shared/types/questionnaire';
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';
  
  interface Props {
    question: TextDisplayQuestion;
    onNext?: () => void;
    disabled?: boolean;
  }
  
  let {
    question,
    onNext,
    disabled = false
  }: Props = $props();
  
  // Configure marked for safety
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
  
  function processContent(content: string, format: string): string {
    let processed = content;
    
    // TODO: Variable substitution
    // if (question.display.variables) {
    //   processed = substituteVariables(processed);
    // }
    
    switch (format) {
      case 'markdown':
        processed = marked(processed) as string;
        processed = DOMPurify.sanitize(processed);
        break;
        
      case 'html':
        processed = DOMPurify.sanitize(processed);
        break;
        
      case 'text':
      default:
        // Plain text - escape HTML
        const div = document.createElement('div');
        div.textContent = processed;
        processed = div.innerHTML;
        break;
    }
    
    return processed;
  }
  
  let processedContent = $derived(processContent(
    question.display.content,
    question.display.format
  ));
  
  let styles = $derived(question.display.styling ? {
    fontSize: question.display.styling.fontSize,
    fontWeight: question.display.styling.fontWeight,
    textAlign: question.display.styling.textAlign,
    color: question.display.styling.color
  } : {});
  
  let cssVars = $derived(Object.entries(styles)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `--${key}: ${value}`)
    .join('; '));
</script>

<article 
  class="text-display-question"
  style={cssVars}
>
  <div 
    class="content"
    class:markdown={question.display.format === 'markdown'}
  >
    {@html processedContent}
  </div>
  
  {#if !question.navigation || question.navigation.showNext !== false}
    <nav class="navigation">
      <button
        type="button"
        class="next-button"
        onclick={onNext}
        {disabled}
      >
        Continue
        <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
        </svg>
      </button>
    </nav>
  {/if}
</article>

<style>
  .text-display-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .content {
    font-size: var(--fontSize, 1rem);
    font-weight: var(--fontWeight, 400);
    text-align: var(--textAlign, left);
    color: var(--color, #1f2937);
    line-height: 1.6;
  }
  
  /* Markdown content styling */
  .content.markdown :global(h1),
  .content.markdown :global(h2),
  .content.markdown :global(h3),
  .content.markdown :global(h4),
  .content.markdown :global(h5),
  .content.markdown :global(h6) {
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
    line-height: 1.25;
  }
  
  .content.markdown :global(h1) { font-size: 2rem; }
  .content.markdown :global(h2) { font-size: 1.5rem; }
  .content.markdown :global(h3) { font-size: 1.25rem; }
  .content.markdown :global(h4) { font-size: 1.125rem; }
  .content.markdown :global(h5) { font-size: 1rem; }
  .content.markdown :global(h6) { font-size: 0.875rem; }
  
  .content.markdown :global(p) {
    margin-bottom: 1rem;
  }
  
  .content.markdown :global(ul),
  .content.markdown :global(ol) {
    margin-bottom: 1rem;
    padding-left: 2rem;
  }
  
  .content.markdown :global(li) {
    margin-bottom: 0.25rem;
  }
  
  .content.markdown :global(strong) {
    font-weight: 600;
  }
  
  .content.markdown :global(em) {
    font-style: italic;
  }
  
  .content.markdown :global(code) {
    background-color: #f3f4f6;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: monospace;
    font-size: 0.875em;
  }
  
  .content.markdown :global(pre) {
    background-color: #1f2937;
    color: #f3f4f6;
    padding: 1rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    margin-bottom: 1rem;
  }
  
  .content.markdown :global(pre code) {
    background-color: transparent;
    padding: 0;
  }
  
  .content.markdown :global(blockquote) {
    border-left: 4px solid #e5e7eb;
    padding-left: 1rem;
    margin: 1rem 0;
    font-style: italic;
    color: #6b7280;
  }
  
  .content.markdown :global(a) {
    color: #3b82f6;
    text-decoration: underline;
  }
  
  .content.markdown :global(a:hover) {
    color: #2563eb;
  }
  
  .navigation {
    display: flex;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }
  
  .next-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    background-color: #3b82f6;
    color: white;
    font-weight: 500;
    font-size: 0.875rem;
    line-height: 1.25rem;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .next-button:hover:not(:disabled) {
    background-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  
  .next-button:active {
    transform: translateY(0);
  }
  
  .next-button:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
  }
  
  .next-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
</style>