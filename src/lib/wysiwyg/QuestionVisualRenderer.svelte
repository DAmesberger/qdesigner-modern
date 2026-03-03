<script lang="ts">
  import type { Question, QuestionnaireTheme } from '$lib/shared';
  import { defaultTheme } from '$lib/shared';
  import { produce } from 'immer';
  import {
    loadMediaUrls,
    processContentWithMediaSync,
    extractMediaFromDisplay,
  } from '$lib/services/mediaHandling';
  import { interpolateVariables } from '$lib/services/variableInterpolation';
  import type { MediaConfig } from '$lib/shared/types/questionnaire';
  import { Pencil, Copy, ArrowUp, ArrowDown, Trash2 } from 'lucide-svelte';

  interface Props {
    question: Question;
    theme?: QuestionnaireTheme;
    mode?: 'edit' | 'preview';
    selected?: boolean;
    variables?: Record<string, any>;
    onselect?: () => void;
    onupdate?: (updates: any) => void;
    oneditproperties?: () => void;
    ondelete?: () => void;
  }

  let {
    question,
    theme = defaultTheme,
    mode = 'preview',
    selected = false,
    variables = {},
    onselect,
    onupdate,
    oneditproperties,
    ondelete,
  }: Props = $props();

  // Media handling
  let mediaUrls: Record<string, string> = $state({});
  let media = $state<MediaConfig[]>([]);

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);

  // Reactive media loading
  $effect(() => {
    const newMedia = extractMediaFromDisplay(question.display) as MediaConfig[];

    if (JSON.stringify(media) !== JSON.stringify(newMedia)) {
      media = newMedia;
      loadMediaUrlsForQuestion();
    }
  });

  async function loadMediaUrlsForQuestion() {
    if (!media || media.length === 0) {
      mediaUrls = {};
      return;
    }

    try {
      const urls = await loadMediaUrls(media);
      mediaUrls = { ...urls };
    } catch (error) {
      console.error('[QuestionVisualRenderer] Failed to load media URLs:', error);
      mediaUrls = {};
    }
  }

  function getQuestionStyles() {
    const styles = theme.components.question;
    return {
      container: {
        ...styles.container,
        ...(selected && mode === 'edit' ? { outline: 'none' } : {}),
      },
      prompt: styles.prompt,
      description: styles.description,
    };
  }

  function getQuestionText(question: Question): string {
    const q = question as any;
    if (q.display?.content) return q.display.content;
    if (q.display?.prompt) return q.display.prompt;
    return q.text || '';
  }

  function isDisplayOnly(question: Question): boolean {
    return ['instruction', 'text-instruction', 'text-display', 'media-display', 'webgl'].includes(
      question.type
    );
  }

  // Inline editing
  let isEditingPrompt = $state(false);

  function handlePromptClick() {
    if (mode === 'edit' && !isEditingPrompt) {
      isEditingPrompt = true;
    }
  }

  function handlePromptBlur() {
    isEditingPrompt = false;
    const currentText = getQuestionText(question);
    if (promptText !== currentText) {
      const q = question as any;
      if (q.display?.content !== undefined) {
        onupdate?.({ display: { ...q.display, content: promptText } });
      } else if (q.display?.prompt !== undefined) {
        onupdate?.({ display: { ...q.display, prompt: promptText } });
      } else {
        onupdate?.({ text: promptText });
      }
    }
  }

  // Context menu
  function handleContextMenu(e: MouseEvent) {
    if (mode !== 'edit') return;
    e.preventDefault();
    onselect?.();
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextMenuOpen = true;
  }

  function closeContextMenu() {
    contextMenuOpen = false;
  }

  function handleContextAction(action: string) {
    closeContextMenu();
    switch (action) {
      case 'properties':
        oneditproperties?.();
        break;
      case 'duplicate':
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true }));
        }
        break;
      case 'move-up':
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true }));
        }
        break;
      case 'move-down':
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true }));
        }
        break;
      case 'delete':
        ondelete?.();
        break;
    }
  }

  // Response rendering
  function renderResponse(question: Question, theme: QuestionnaireTheme) {
    if (isDisplayOnly(question)) return null;
    switch (question.type) {
      case 'single-choice':
      case 'multiple-choice':
        return renderChoiceQuestion(question, theme);
      case 'text-input':
      case 'number-input':
        return renderTextQuestion(question, theme);
      case 'scale':
        return renderScaleQuestion(question, theme);
      case 'rating':
        return renderRatingQuestion(question, theme);
      case 'ranking':
        return renderRankingQuestion(question, theme);
      case 'drawing':
        return renderDrawingQuestion(question, theme);
      default:
        return null;
    }
  }

  function renderChoiceQuestion(question: Question, theme: QuestionnaireTheme) {
    const q = question as typeof question & {
      display?: { options?: any[] };
      responseType?: { options?: any[]; type?: string };
    };
    const displayOptions = q.display?.options || [];
    const responseOptions = q.responseType?.options || [];
    const options =
      displayOptions.length > 0
        ? displayOptions.map((opt: any) => opt.label || opt.value)
        : responseOptions.length > 0
          ? responseOptions.map((opt: any) => opt.label || opt.value)
          : ['Option 1', 'Option 2', 'Option 3'];
    const multipleChoice = question.type === 'multiple-choice' || q.responseType?.type === 'multiple';
    const styles = theme.components.response.choice;
    return { component: 'choice' as const, options, multipleChoice, styles };
  }

  function renderTextQuestion(question: Question, theme: QuestionnaireTheme) {
    const q = question as any;
    const multiline = q.config?.multiline || q.display?.multiline || q.settings?.multiline || false;
    const placeholder = q.config?.placeholder || q.display?.placeholder || q.settings?.placeholder || 'Enter your response...';
    const styles = multiline ? theme.components.response.text.textarea : theme.components.response.text.input;
    return { component: 'text' as const, multiline, placeholder, styles };
  }

  function renderScaleQuestion(question: Question, theme: QuestionnaireTheme) {
    const q = question as any;
    const scale = q.response?.scale || {};
    const min = scale.min || q.settings?.min || 1;
    const max = scale.max || q.settings?.max || 5;
    const labels = scale.labels || q.settings?.labels || {};
    const styles = theme.components.response.scale;
    return { component: 'scale' as const, min, max, labels, styles };
  }

  function renderRatingQuestion(question: Question, theme: QuestionnaireTheme) {
    const q = question as any;
    const rating = q.response?.rating || {};
    const max = rating.max || 5;
    const type = rating.type || 'star';
    const styles = theme.components.response.scale;
    return { component: 'rating' as const, max, type, styles };
  }

  function renderRankingQuestion(question: Question, theme: QuestionnaireTheme) {
    const q = question as any;
    const items = q.display?.items || [
      { id: '1', label: 'Item A' },
      { id: '2', label: 'Item B' },
      { id: '3', label: 'Item C' },
      { id: '4', label: 'Item D' },
    ];
    const styles = theme.components.response.choice;
    return { component: 'ranking' as const, items, styles };
  }

  function renderDrawingQuestion(question: Question, theme: QuestionnaireTheme) {
    const q = question as any;
    const canvas = q.display?.canvas || { width: 600, height: 400, background: 'hsl(var(--card))' };
    const styles = theme.components.response.text.textarea;
    return { component: 'drawing' as const, canvas, styles };
  }

  let questionStyles = $derived(getQuestionStyles());
  let responseConfig = $derived(renderResponse(question, theme));
  let promptText = $state('');

  $effect(() => {
    promptText = getQuestionText(question);
  });

  let parsedMarkdown = $derived.by(() => {
    if (question.type === 'instruction' || (question as any).type === 'text-instruction') {
      const q = question as any;
      const content = q.display?.content || q.text;
      if (!content) return null;
      try {
        return processContentWithMediaSync(content, media, mediaUrls, {
          format: 'markdown',
          processVariables: true,
          variables,
        });
      } catch (error) {
        console.error('Error parsing markdown:', error);
        return content;
      }
    }
    return null;
  });
</script>

<svelte:window onclick={() => { if (contextMenuOpen) closeContextMenu(); }} />

<div
  class="question-container p-6 bg-card rounded-[var(--radius)] shadow-[var(--shadow-sm)] border border-transparent transition-all duration-200 {selected && mode === 'edit'
    ? 'ring-2 ring-primary shadow-[var(--shadow-glow)]'
    : 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5'}"
  onclick={() => onselect?.()}
  oncontextmenu={handleContextMenu}
  role="button"
  tabindex="0"
  onkeydown={(e) => {
    const target = e.target as HTMLElement | null;
    const isEditable = target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
    if (!isEditable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onselect?.();
    }
  }}
>
  {#if mode === 'edit' && isEditingPrompt}
    <div
      contenteditable="true"
      class="prompt-editor text-lg font-semibold text-foreground mb-3"
      bind:textContent={promptText}
      onblur={handlePromptBlur}
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePromptBlur(); }
      }}
      role="textbox"
      aria-multiline="true"
      tabindex="0"
    ></div>
  {:else}
    <div
      class="prompt text-lg font-semibold text-foreground mb-3"
      onclick={handlePromptClick}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePromptClick(); }}
      role="button"
      tabindex="0"
    >
      {#if parsedMarkdown}
        <div class="markdown-content">{@html parsedMarkdown}</div>
      {:else}
        {interpolateVariables(getQuestionText(question), variables)}
      {/if}
    </div>
  {/if}

  {#if (question as any).display?.description || question.settings?.description}
    <div class="description text-sm text-muted-foreground mb-4">
      {@html processContentWithMediaSync(
        (question as any).display?.description || question.settings?.description || '',
        [], {}, { format: 'markdown', processVariables: true, variables }
      )}
    </div>
  {/if}

  <div class="response-area mt-4">
    {#if responseConfig?.component === 'choice'}
      {@const choiceConfig = responseConfig}
      <div class="choices flex flex-col gap-3">
        {#each choiceConfig.options as option, index}
          <label class="choice-option flex items-center p-3 border-2 border-input rounded-md bg-background hover:bg-accent hover:border-primary transition-all cursor-pointer">
            <input type={choiceConfig.multipleChoice ? 'checkbox' : 'radio'} name={`question-${question.id}`} value={option} disabled={mode === 'edit'} />
            <span class="ml-2">{@html processContentWithMediaSync(option, [], {}, { format: 'markdown', processVariables: true, variables })}</span>
          </label>
        {/each}
      </div>
    {:else if responseConfig?.component === 'text'}
      {@const textConfig = responseConfig}
      {#if textConfig.multiline}
        <textarea placeholder={textConfig.placeholder} rows="4" class="w-full p-2 border border-input rounded-md bg-background text-foreground" disabled={mode === 'edit'}></textarea>
      {:else}
        <input type="text" placeholder={textConfig.placeholder} class="w-full p-2 border border-input rounded-md bg-background text-foreground" disabled={mode === 'edit'} />
      {/if}
    {:else if responseConfig?.component === 'scale'}
      {@const scaleConfig = responseConfig}
      <div class="scale-options flex gap-2 justify-between">
        {#each Array(scaleConfig.max - scaleConfig.min + 1) as _, i}
          {@const value = scaleConfig.min + i}
          <label class="scale-option flex-1 p-2 border-2 border-input rounded bg-background hover:bg-accent hover:border-primary transition-all cursor-pointer text-center">
            <input type="radio" name={`question-${question.id}`} {value} disabled={mode === 'edit'} class="block mx-auto mb-1" />
            <span>{value}</span>
            {#if (value === scaleConfig.min && scaleConfig.labels.min) || (value === scaleConfig.max && scaleConfig.labels.max)}
              <div class="text-sm text-muted-foreground mt-1">
                {@html processContentWithMediaSync(value === scaleConfig.min ? scaleConfig.labels.min : scaleConfig.labels.max, [], {}, { format: 'markdown', processVariables: true, variables })}
              </div>
            {/if}
          </label>
        {/each}
      </div>
    {:else if responseConfig?.component === 'rating'}
      {@const ratingConfig = responseConfig}
      <div class="rating-options flex gap-2">
        {#each Array(ratingConfig.max) as _, i}
          {@const value = i + 1}
          <button class="rating-star" style="font-size: 24px; background: none; border: none; cursor: pointer; color: {value <= 3 ? '#FFB800' : '#E0E0E0'}; transition: all 150ms" disabled={mode === 'edit'}>
            {ratingConfig.type === 'star' ? '\u2605' : value}
          </button>
        {/each}
      </div>
    {:else if responseConfig?.component === 'ranking'}
      {@const rankingConfig = responseConfig}
      <div class="ranking-items flex flex-col gap-2">
        <div class="text-muted-foreground text-sm mb-2">
          {@html processContentWithMediaSync((question as any).display?.instruction || 'Drag items to rank them', [], {}, { format: 'markdown', processVariables: true, variables })}
        </div>
        {#each rankingConfig.items as item, index}
          <div class="ranking-item p-3 bg-card border border-border rounded-md cursor-move flex items-center gap-3">
            <span class="text-muted-foreground font-semibold">{index + 1}.</span>
            <span>{@html processContentWithMediaSync(item.label, [], {}, { format: 'markdown', processVariables: true, variables })}</span>
          </div>
        {/each}
      </div>
    {:else if responseConfig?.component === 'drawing'}
      {@const drawingConfig = responseConfig}
      <div class="drawing-canvas border-2 border-dashed border-border rounded-lg bg-card relative overflow-hidden">
        <div style="width: {drawingConfig.canvas.width}px; height: {drawingConfig.canvas.height}px; display: flex; align-items: center; justify-content: center">
          <div class="text-center text-muted-foreground">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mx-auto mb-2">
              <path d="M12 2L2 7L2 12C2 16.4183 5.58172 20 10 20C10 20 14 20 14 20C18.4183 20 22 16.4183 22 12L22 7L12 2Z" />
              <path d="M12 7L12 15" /><path d="M8 11L16 11" />
            </svg>
            <div class="text-sm">
              {@html processContentWithMediaSync((question as any).display?.instruction || 'Drawing canvas would appear here', [], {}, { format: 'markdown', processVariables: true, variables })}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if contextMenuOpen}
  <div
    class="fixed z-50 min-w-[160px] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-[var(--shadow-lg)] rounded-[var(--radius)] border border-border py-1 context-menu-animate"
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
    role="menu"
    data-testid="question-context-menu"
  >
    <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors duration-100" onclick={() => handleContextAction('properties')} role="menuitem">
      <Pencil class="h-3.5 w-3.5" />
      Edit Properties
    </button>
    <button type="button" class="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors duration-100" onclick={() => handleContextAction('duplicate')} role="menuitem">
      <span class="flex items-center gap-2"><Copy class="h-3.5 w-3.5" />Duplicate</span><kbd class="text-xs text-muted-foreground">Ctrl+D</kbd>
    </button>
    <div class="my-1 h-px bg-border"></div>
    <button type="button" class="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors duration-100" onclick={() => handleContextAction('move-up')} role="menuitem">
      <span class="flex items-center gap-2"><ArrowUp class="h-3.5 w-3.5" />Move Up</span><kbd class="text-xs text-muted-foreground">Alt+&uarr;</kbd>
    </button>
    <button type="button" class="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors duration-100" onclick={() => handleContextAction('move-down')} role="menuitem">
      <span class="flex items-center gap-2"><ArrowDown class="h-3.5 w-3.5" />Move Down</span><kbd class="text-xs text-muted-foreground">Alt+&darr;</kbd>
    </button>
    <div class="my-1 h-px bg-border"></div>
    <button type="button" class="flex w-full items-center justify-between px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors duration-100" onclick={() => handleContextAction('delete')} role="menuitem">
      <span class="flex items-center gap-2"><Trash2 class="h-3.5 w-3.5" />Delete</span><kbd class="text-xs text-muted-foreground">Del</kbd>
    </button>
  </div>
{/if}

<style>
  .question-container { position: relative; cursor: pointer; }
  .prompt-editor { outline: none; background: hsl(var(--primary) / 0.05); padding: 2px 4px; border-radius: 2px; }
  .choice-option { display: flex; align-items: center; cursor: pointer; transition: all 150ms ease-in-out; }
  .choice-option:hover { transform: translateX(4px); }
  .scale-option:hover { transform: scale(1.05); }
  :global(.question-container input[type='radio']), :global(.question-container input[type='checkbox']) { cursor: pointer; }

  .context-menu-animate { animation: context-menu-in 100ms ease-out; }
  @keyframes context-menu-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

  :global(.markdown-content) { line-height: 1.6; }
  :global(.markdown-content h1), :global(.markdown-content h2), :global(.markdown-content h3),
  :global(.markdown-content h4), :global(.markdown-content h5), :global(.markdown-content h6) { margin-top: 1em; margin-bottom: 0.5em; font-weight: 600; }
  :global(.markdown-content h1) { font-size: 1.5em; }
  :global(.markdown-content h2) { font-size: 1.3em; }
  :global(.markdown-content h3) { font-size: 1.1em; }
  :global(.markdown-content p) { margin-bottom: 0.75em; }
  :global(.markdown-content ul), :global(.markdown-content ol) { margin-left: 1.5em; margin-bottom: 0.75em; }
  :global(.markdown-content li) { margin-bottom: 0.25em; }
  :global(.markdown-content strong) { font-weight: 600; }
  :global(.markdown-content em) { font-style: italic; }
  :global(.markdown-content code) { background-color: rgba(0, 0, 0, 0.05); padding: 0.125em 0.25em; border-radius: 0.25em; font-family: monospace; font-size: 0.9em; }
  :global(.markdown-content pre) { background-color: rgba(0, 0, 0, 0.05); padding: 1em; border-radius: 0.5em; overflow-x: auto; margin-bottom: 0.75em; }
  :global(.markdown-content pre code) { background-color: transparent; padding: 0; }
  :global(.markdown-content blockquote) { border-left: 4px solid #ddd; padding-left: 1em; margin-left: 0; color: #666; font-style: italic; }
  :global(.markdown-content img) { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
  :global(.markdown-content a) { color: hsl(var(--primary)); text-decoration: underline; }
  :global(.markdown-content a:hover) { opacity: 0.8; }
  :global(.markdown-content table) { border-collapse: collapse; width: 100%; margin-bottom: 0.75em; }
  :global(.markdown-content th), :global(.markdown-content td) { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
  :global(.markdown-content th) { background-color: rgba(0, 0, 0, 0.05); font-weight: 600; }
</style>
