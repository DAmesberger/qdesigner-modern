<script lang="ts">
  import type { QuestionnaireTheme } from '$lib/shared/types/types';
  import { createEventDispatcher } from 'svelte';
  
  export let theme: QuestionnaireTheme;
  export let selectedElement: 'question' | 'page' | 'global' = 'question';
  
  const dispatch = createEventDispatcher();
  
  // Color picker state
  let activeColorPicker: string | null = null;
  
  // Typography options
  const fontFamilies = [
    { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'System UI' },
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: '"Times New Roman", serif', label: 'Times New Roman' },
    { value: '"Courier New", monospace', label: 'Courier New' },
    { value: 'Inter, sans-serif', label: 'Inter' },
    { value: '"Roboto", sans-serif', label: 'Roboto' },
  ];
  
  const fontSizes = [
    { value: '0.75rem', label: 'XS' },
    { value: '0.875rem', label: 'SM' },
    { value: '1rem', label: 'Base' },
    { value: '1.125rem', label: 'LG' },
    { value: '1.25rem', label: 'XL' },
    { value: '1.5rem', label: '2XL' },
    { value: '1.875rem', label: '3XL' },
  ];
  
  // Update theme
  function updateTheme(path: string[], value: any) {
    dispatch('update', { path, value });
  }
  
  // Get nested value from theme
  function getThemeValue(path: string[]): any {
    return path.reduce((obj, key) => obj?.[key], theme);
  }
</script>

<div class="style-editor">
  <!-- Tab Selection -->
  <div class="tabs">
    <button
      class="tab"
      class:active={selectedElement === 'global'}
      on:click={() => selectedElement = 'global'}
    >
      Global
    </button>
    <button
      class="tab"
      class:active={selectedElement === 'page'}
      on:click={() => selectedElement = 'page'}
    >
      Page
    </button>
    <button
      class="tab"
      class:active={selectedElement === 'question'}
      on:click={() => selectedElement = 'question'}
    >
      Question
    </button>
  </div>
  
  <!-- Global Styles -->
  {#if selectedElement === 'global'}
    <div class="section">
      <h3>Colors</h3>
      
      <div class="color-grid">
        <div class="color-item">
          <label>Primary</label>
          <div 
            class="color-swatch"
            style="background: {theme.global.colors.primary}"
            on:click={() => activeColorPicker = 'primary'}
          />
          <input
            type="color"
            value={theme.global.colors.primary}
            on:input={(e) => updateTheme(['global', 'colors', 'primary'], e.currentTarget.value)}
            style="display: none"
          />
        </div>
        
        <div class="color-item">
          <label>Background</label>
          <div 
            class="color-swatch"
            style="background: {theme.global.colors.background}"
            on:click={() => activeColorPicker = 'background'}
          />
          <input
            type="color"
            value={theme.global.colors.background}
            on:input={(e) => updateTheme(['global', 'colors', 'background'], e.currentTarget.value)}
            style="display: none"
          />
        </div>
        
        <div class="color-item">
          <label>Text</label>
          <div 
            class="color-swatch"
            style="background: {theme.global.colors.text.primary}"
            on:click={() => activeColorPicker = 'text.primary'}
          />
          <input
            type="color"
            value={theme.global.colors.text.primary}
            on:input={(e) => updateTheme(['global', 'colors', 'text', 'primary'], e.currentTarget.value)}
            style="display: none"
          />
        </div>
        
        <div class="color-item">
          <label>Border</label>
          <div 
            class="color-swatch"
            style="background: {theme.global.colors.border}"
            on:click={() => activeColorPicker = 'border'}
          />
          <input
            type="color"
            value={theme.global.colors.border}
            on:input={(e) => updateTheme(['global', 'colors', 'border'], e.currentTarget.value)}
            style="display: none"
          />
        </div>
      </div>
    </div>
    
    <div class="section">
      <h3>Typography</h3>
      
      <div class="control-group">
        <label>Font Family</label>
        <select
          value={theme.global.typography.fontFamily.sans}
          on:change={(e) => updateTheme(['global', 'typography', 'fontFamily', 'sans'], e.currentTarget.value)}
        >
          {#each fontFamilies as font}
            <option value={font.value}>{font.label}</option>
          {/each}
        </select>
      </div>
      
      <div class="control-group">
        <label>Base Font Size</label>
        <select
          value={theme.global.typography.fontSize.base}
          on:change={(e) => updateTheme(['global', 'typography', 'fontSize', 'base'], e.currentTarget.value)}
        >
          {#each fontSizes as size}
            <option value={size.value}>{size.label}</option>
          {/each}
        </select>
      </div>
    </div>
    
    <div class="section">
      <h3>Effects</h3>
      
      <div class="control-group">
        <label>Shadow</label>
        <select
          value={theme.global.effects.shadows.base}
          on:change={(e) => updateTheme(['global', 'effects', 'shadows', 'base'], e.currentTarget.value)}
        >
          <option value="none">None</option>
          <option value="{theme.global.effects.shadows.sm}">Small</option>
          <option value="{theme.global.effects.shadows.base}">Medium</option>
          <option value="{theme.global.effects.shadows.lg}">Large</option>
        </select>
      </div>
      
      <div class="control-group">
        <label>Border Radius</label>
        <select
          value={theme.global.borders.radius.base}
          on:change={(e) => updateTheme(['global', 'borders', 'radius', 'base'], e.currentTarget.value)}
        >
          <option value="0">None</option>
          <option value="0.25rem">Small</option>
          <option value="0.375rem">Medium</option>
          <option value="0.5rem">Large</option>
          <option value="0.75rem">XL</option>
        </select>
      </div>
    </div>
  {/if}
  
  <!-- Page Styles -->
  {#if selectedElement === 'page'}
    <div class="section">
      <h3>Page Layout</h3>
      
      <div class="control-group">
        <label>Background</label>
        <div 
          class="color-swatch"
          style="background: {theme.components.page.background}"
          on:click={() => activeColorPicker = 'page.background'}
        />
        <input
          type="color"
          value={theme.components.page.background}
          on:input={(e) => updateTheme(['components', 'page', 'background'], e.currentTarget.value)}
          style="display: none"
        />
      </div>
      
      <div class="control-group">
        <label>Padding</label>
        <input
          type="range"
          min="0"
          max="128"
          step="8"
          value={parseInt(theme.components.page.padding)}
          on:input={(e) => updateTheme(['components', 'page', 'padding'], `${e.currentTarget.value}px`)}
        />
        <span>{theme.components.page.padding}</span>
      </div>
      
      <div class="control-group">
        <label>Max Width</label>
        <select
          value={theme.components.page.maxWidth}
          on:change={(e) => updateTheme(['components', 'page', 'maxWidth'], e.currentTarget.value)}
        >
          <option value="32rem">Small (512px)</option>
          <option value="48rem">Medium (768px)</option>
          <option value="64rem">Large (1024px)</option>
          <option value="80rem">XL (1280px)</option>
          <option value="none">Full Width</option>
        </select>
      </div>
    </div>
  {/if}
  
  <!-- Question Styles -->
  {#if selectedElement === 'question'}
    <div class="section">
      <h3>Question Container</h3>
      
      <div class="control-group">
        <label>Background</label>
        <div 
          class="color-swatch"
          style="background: {theme.components.question.container.background}"
          on:click={() => activeColorPicker = 'question.background'}
        />
        <input
          type="color"
          value={theme.components.question.container.background}
          on:input={(e) => updateTheme(['components', 'question', 'container', 'background'], e.currentTarget.value)}
          style="display: none"
        />
      </div>
      
      <div class="control-group">
        <label>Padding</label>
        <input
          type="range"
          min="0"
          max="64"
          step="4"
          value={parseInt(theme.components.question.container.padding)}
          on:input={(e) => updateTheme(['components', 'question', 'container', 'padding'], `${e.currentTarget.value}px`)}
        />
        <span>{theme.components.question.container.padding}</span>
      </div>
      
      <div class="control-group">
        <label>Border Radius</label>
        <input
          type="range"
          min="0"
          max="24"
          step="2"
          value={parseInt(theme.components.question.container.borderRadius)}
          on:input={(e) => updateTheme(['components', 'question', 'container', 'borderRadius'], `${e.currentTarget.value}px`)}
        />
        <span>{theme.components.question.container.borderRadius}</span>
      </div>
      
      <div class="control-group">
        <label>Shadow</label>
        <select
          value={theme.components.question.container.boxShadow}
          on:change={(e) => updateTheme(['components', 'question', 'container', 'boxShadow'], e.currentTarget.value)}
        >
          <option value="none">None</option>
          <option value="{theme.global.effects.shadows.sm}">Small</option>
          <option value="{theme.global.effects.shadows.base}">Medium</option>
          <option value="{theme.global.effects.shadows.lg}">Large</option>
        </select>
      </div>
    </div>
    
    <div class="section">
      <h3>Question Text</h3>
      
      <div class="control-group">
        <label>Font Size</label>
        <select
          value={theme.components.question.prompt.fontSize}
          on:change={(e) => updateTheme(['components', 'question', 'prompt', 'fontSize'], e.currentTarget.value)}
        >
          {#each fontSizes as size}
            <option value={size.value}>{size.label}</option>
          {/each}
        </select>
      </div>
      
      <div class="control-group">
        <label>Font Weight</label>
        <input
          type="range"
          min="300"
          max="700"
          step="100"
          value={theme.components.question.prompt.fontWeight}
          on:input={(e) => updateTheme(['components', 'question', 'prompt', 'fontWeight'], parseInt(e.currentTarget.value))}
        />
        <span>{theme.components.question.prompt.fontWeight}</span>
      </div>
      
      <div class="control-group">
        <label>Text Color</label>
        <div 
          class="color-swatch"
          style="background: {theme.components.question.prompt.color}"
          on:click={() => activeColorPicker = 'question.prompt.color'}
        />
        <input
          type="color"
          value={theme.components.question.prompt.color}
          on:input={(e) => updateTheme(['components', 'question', 'prompt', 'color'], e.currentTarget.value)}
          style="display: none"
        />
      </div>
    </div>
  {/if}
  
  <!-- Custom CSS -->
  <div class="section">
    <h3>Custom CSS</h3>
    <textarea
      placeholder="/* Add custom CSS here */"
      value={theme.customCSS || ''}
      on:input={(e) => updateTheme(['customCSS'], e.currentTarget.value)}
      rows="6"
    />
  </div>
</div>

<style>
  .style-editor {
    height: 100%;
    overflow-y: auto;
    padding: 1rem;
  }
  
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #E5E7EB;
  }
  
  .tab {
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-weight: 500;
    color: #6B7280;
    transition: all 150ms;
  }
  
  .tab:hover {
    color: #374151;
  }
  
  .tab.active {
    color: #3B82F6;
    border-bottom-color: #3B82F6;
  }
  
  .section {
    margin-bottom: 2rem;
  }
  
  .section h3 {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6B7280;
    margin-bottom: 1rem;
  }
  
  .control-group {
    margin-bottom: 1rem;
  }
  
  .control-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.25rem;
  }
  
  .control-group input[type="range"] {
    width: calc(100% - 3rem);
    margin-right: 0.5rem;
  }
  
  .control-group select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #E5E7EB;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  
  .color-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  
  .color-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .color-item label {
    font-size: 0.75rem;
    color: #6B7280;
  }
  
  .color-swatch {
    width: 100%;
    height: 2rem;
    border-radius: 0.375rem;
    border: 1px solid #E5E7EB;
    cursor: pointer;
    transition: transform 150ms;
  }
  
  .color-swatch:hover {
    transform: scale(1.05);
  }
  
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #E5E7EB;
    border-radius: 0.375rem;
    font-family: monospace;
    font-size: 0.75rem;
    resize: vertical;
  }
</style>