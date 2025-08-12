<script lang="ts">
  import BaseInstruction from '../shared/base/BaseInstruction.svelte';
  import type { InstructionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';
  import { scriptingEngine } from '$lib/scripting';
  
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
  
  interface Props extends InstructionProps {
    instruction: Question & { config: TextDisplayConfig };
  }
  
  let {
    instruction,
    mode = 'runtime',
    onContinue,
    onInteraction
  }: Props = $props();
  
  let processedContent = $state('');
  let autoAdvanceTimer: number | null = null;
  
  // Configure marked
  marked.use({
    breaks: true,
    gfm: true
  });
  
  // Process content with markdown and variable interpolation
  $effect(() => {
    processContent();
  });
  
  async function processContent() {
    let content = instruction.config.content || '';
    
    // Variable interpolation
    if (instruction.config.variables) {
      try {
        content = await scriptingEngine.interpolateVariables(content);
      } catch (error) {
        console.error('Error interpolating variables:', error);
      }
    }
    
    // Markdown processing
    if (instruction.config.markdown) {
      content = marked.parse(content) as string;
      // Sanitize HTML to prevent XSS
      content = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'u', 's', 
                      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'hr', 'table', 
                      'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel']
      });
    }
    
    processedContent = content;
  }
  
  // Auto-advance setup
  $effect(() => {
    if (mode === 'runtime' && instruction.config.autoAdvance?.enabled && instruction.config.autoAdvance.delay > 0) {
      autoAdvanceTimer = window.setTimeout(() => {
        onContinue?.();
        onInteraction?.({
          type: 'auto-advance',
          timestamp: Date.now(),
          data: { delay: instruction.config.autoAdvance!.delay }
        });
      }, instruction.config.autoAdvance.delay);
    }
    
    return () => {
      if (autoAdvanceTimer !== null) {
        clearTimeout(autoAdvanceTimer);
      }
    };
  });
  
  // Build style object
  const contentStyle = $derived(() => {
    const styles: Record<string, string> = {};
    const styling = instruction.config.styling;
    
    if (styling) {
      if (styling.fontSize) styles['font-size'] = styling.fontSize;
      if (styling.textAlign) styles['text-align'] = styling.textAlign;
      if (styling.fontWeight) styles['font-weight'] = styling.fontWeight;
      if (styling.fontFamily) styles['font-family'] = styling.fontFamily;
      if (styling.color) styles['color'] = styling.color;
      if (styling.backgroundColor) styles['background-color'] = styling.backgroundColor;
      if (styling.padding) styles['padding'] = styling.padding;
      if (styling.borderRadius) styles['border-radius'] = styling.borderRadius;
    }
    
    return Object.entries(styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  });
</script>

<BaseInstruction
  {instruction}
  {mode}
  {onContinue}
  {onInteraction}
>
  <div 
    class="text-display-content"
    style={contentStyle()}
  >
    {#if instruction.config.markdown}
      {@html processedContent}
    {:else}
      {processedContent}
    {/if}
  </div>
  
  {#if mode === 'runtime' && instruction.config.autoAdvance?.enabled}
    <div class="auto-advance-indicator">
      This screen will advance automatically in {Math.round(instruction.config.autoAdvance.delay / 1000)} seconds
    </div>
  {/if}
</BaseInstruction>

<style>
  .text-display-content {
    line-height: 1.6;
    transition: all 0.3s ease;
  }
  
  /* Default styles for markdown content */
  :global(.text-display-content h1) {
    font-size: 2rem;
    font-weight: 700;
    margin: 1.5rem 0 1rem;
  }
  
  :global(.text-display-content h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 1.25rem 0 0.75rem;
  }
  
  :global(.text-display-content h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem;
  }
  
  :global(.text-display-content p) {
    margin: 0.75rem 0;
  }
  
  :global(.text-display-content ul),
  :global(.text-display-content ol) {
    margin: 0.75rem 0;
    padding-left: 2rem;
  }
  
  :global(.text-display-content li) {
    margin: 0.25rem 0;
  }
  
  :global(.text-display-content blockquote) {
    margin: 1rem 0;
    padding: 0.75rem 1.25rem;
    border-left: 4px solid #e5e7eb;
    background: #f9fafb;
    font-style: italic;
  }
  
  :global(.text-display-content code) {
    padding: 0.125rem 0.375rem;
    background: #f3f4f6;
    border-radius: 0.25rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.875em;
  }
  
  :global(.text-display-content pre) {
    margin: 1rem 0;
    padding: 1rem;
    background: #f3f4f6;
    border-radius: 0.5rem;
    overflow-x: auto;
  }
  
  :global(.text-display-content pre code) {
    padding: 0;
    background: none;
  }
  
  :global(.text-display-content a) {
    color: #3b82f6;
    text-decoration: underline;
  }
  
  :global(.text-display-content a:hover) {
    color: #2563eb;
  }
  
  :global(.text-display-content img) {
    max-width: 100%;
    height: auto;
    margin: 1rem 0;
    border-radius: 0.5rem;
  }
  
  :global(.text-display-content hr) {
    margin: 2rem 0;
    border: none;
    border-top: 1px solid #e5e7eb;
  }
  
  :global(.text-display-content table) {
    width: 100%;
    margin: 1rem 0;
    border-collapse: collapse;
  }
  
  :global(.text-display-content th),
  :global(.text-display-content td) {
    padding: 0.5rem 1rem;
    border: 1px solid #e5e7eb;
    text-align: left;
  }
  
  :global(.text-display-content th) {
    background: #f9fafb;
    font-weight: 600;
  }
  
  .auto-advance-indicator {
    margin-top: 1.5rem;
    padding: 0.75rem 1rem;
    background: #eff6ff;
    border: 1px solid #dbeafe;
    border-radius: 0.375rem;
    color: #1e40af;
    font-size: 0.875rem;
    text-align: center;
  }
  
  /* Responsive adjustments */
  @media (max-width: 640px) {
    :global(.text-display-content h1) {
      font-size: 1.5rem;
    }
    
    :global(.text-display-content h2) {
      font-size: 1.25rem;
    }
    
    :global(.text-display-content h3) {
      font-size: 1.125rem;
    }
  }
</style>