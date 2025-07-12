<script lang="ts">
  import theme from './index';
  import { themeMode } from './ThemeProvider.svelte';
  
  const colors = [
    { name: 'Primary', class: 'bg-primary', textClass: 'text-primary-foreground' },
    { name: 'Secondary', class: 'bg-secondary', textClass: 'text-secondary-foreground' },
    { name: 'Accent', class: 'bg-accent', textClass: 'text-accent-foreground' },
    { name: 'Muted', class: 'bg-muted', textClass: 'text-muted-foreground' },
    { name: 'Card', class: 'bg-card', textClass: 'text-card-foreground' },
    { name: 'Destructive', class: 'bg-destructive', textClass: 'text-destructive-foreground' },
  ];
  
  const buttonVariants = Object.entries(theme.components.button.variants);
  const buttonSizes = Object.entries(theme.components.button.sizes);
  
  let showCode = false;
</script>

<div class="style-guide {theme.spacing.page.padding}">
  <div class="{theme.spacing.page.maxWidth}">
    <!-- Header -->
    <div class="{theme.spacing.section.margin}">
      <h1 class="{theme.typography.h1}">QDesigner Style Guide</h1>
      <p class="{theme.typography.bodyLarge} {theme.semantic.textSecondary} mt-4">
        Unified theme system for consistent UI/UX across the application
      </p>
    </div>
    
    <!-- Theme Toggle -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-4">Theme Mode</h2>
      <button
        on:click={() => $themeMode = $themeMode === 'light' ? 'dark' : 'light'}
        class="{theme.components.button.variants.outline} {theme.components.button.sizes.md} rounded-md"
      >
        Current: {$themeMode} mode
      </button>
    </div>
    
    <!-- Colors -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Color Palette</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {#each colors as color}
          <div class="text-center">
            <div class="{color.class} {color.textClass} h-24 rounded-lg flex items-center justify-center font-medium shadow-sm">
              Aa
            </div>
            <p class="{theme.typography.caption} mt-2">{color.name}</p>
          </div>
        {/each}
      </div>
    </div>
    
    <!-- Typography -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Typography</h2>
      <div class="{theme.spacing.stack.lg}">
        <h1 class="{theme.typography.h1}">Heading 1</h1>
        <h2 class="{theme.typography.h2}">Heading 2</h2>
        <h3 class="{theme.typography.h3}">Heading 3</h3>
        <h4 class="{theme.typography.h4}">Heading 4</h4>
        <p class="{theme.typography.bodyLarge}">Large body text for emphasis and readability</p>
        <p class="{theme.typography.body}">Regular body text for standard content</p>
        <p class="{theme.typography.bodySmall}">Small body text for secondary information</p>
        <p class="{theme.typography.caption}">Caption text for labels and metadata</p>
        <p>
          Inline elements: <a href="#" class="{theme.typography.link}">Link text</a>, 
          <code class="{theme.typography.code}">code snippet</code>
        </p>
      </div>
    </div>
    
    <!-- Buttons -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Buttons</h2>
      
      <h3 class="{theme.typography.h4} mb-4">Variants</h3>
      <div class="flex flex-wrap gap-4 mb-8">
        {#each buttonVariants as [name, classes]}
          <button class="{classes} {theme.components.button.sizes.md} rounded-md {theme.semantic.focusRing}">
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </button>
        {/each}
      </div>
      
      <h3 class="{theme.typography.h4} mb-4">Sizes</h3>
      <div class="flex flex-wrap items-center gap-4">
        {#each buttonSizes as [size, classes]}
          <button class="{theme.components.button.variants.default} {classes} rounded-md {theme.semantic.focusRing}">
            {size.toUpperCase()} Button
          </button>
        {/each}
      </div>
    </div>
    
    <!-- Form Elements -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Form Elements</h2>
      
      <div class="grid gap-6 max-w-md">
        <div>
          <label class="{theme.components.form.label} mb-2 block">Input Field</label>
          <input type="text" placeholder="Enter text..." class="{theme.components.form.input}" />
        </div>
        
        <div>
          <label class="{theme.components.form.label} mb-2 block">Textarea</label>
          <textarea placeholder="Enter multiple lines..." class="{theme.components.form.textarea}"></textarea>
        </div>
        
        <div>
          <label class="{theme.components.form.label} mb-2 block">Select</label>
          <select class="{theme.components.form.select}">
            <option>Option 1</option>
            <option>Option 2</option>
            <option>Option 3</option>
          </select>
        </div>
        
        <div class="flex items-center space-x-2">
          <input type="checkbox" id="checkbox" class="{theme.components.form.checkbox}" />
          <label for="checkbox" class="{theme.components.form.label}">Checkbox option</label>
        </div>
      </div>
    </div>
    
    <!-- Cards & Containers -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Cards & Containers</h2>
      
      <div class="{theme.spacing.stack.md}">
        <div class="{theme.components.container.card} p-6">
          <h3 class="{theme.typography.h4} mb-2">Card Container</h3>
          <p class="{theme.semantic.textSecondary}">Used for grouping related content with subtle elevation</p>
        </div>
        
        <div class="{theme.components.container.well}">
          <h4 class="{theme.typography.label} mb-1">Well Container</h4>
          <p class="{theme.typography.bodySmall} {theme.semantic.textSecondary}">Used for inline tips or secondary information</p>
        </div>
      </div>
    </div>
    
    <!-- Badges -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Badges</h2>
      
      <div class="flex flex-wrap gap-4">
        <span class="{theme.components.badge.default} {theme.components.badge.primary}">Primary</span>
        <span class="{theme.components.badge.default} {theme.components.badge.secondary}">Secondary</span>
        <span class="{theme.components.badge.default} {theme.components.badge.destructive}">Destructive</span>
        <span class="{theme.components.badge.default} {theme.components.badge.outline}">Outline</span>
      </div>
    </div>
    
    <!-- Spacing -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Spacing Scale</h2>
      
      <div class="{theme.spacing.stack.sm}">
        {#each ['xs', 'sm', 'md', 'lg', 'xl'] as size}
          <div class="flex items-center gap-4">
            <span class="{theme.typography.code} w-12">{size}</span>
            <div class="{theme.semantic.bgSubtle} h-4 {theme.spacing.stack[size].replace('space-y', 'w')}" />
          </div>
        {/each}
      </div>
    </div>
    
    <!-- Component Examples -->
    <div class="{theme.components.container.section}">
      <h2 class="{theme.typography.h2} mb-6">Component Examples</h2>
      
      <!-- Question Card -->
      <div class="{theme.components.questionCard.base} p-4 mb-4">
        <h3 class="{theme.typography.label} mb-2">Question Card</h3>
        <p class="{theme.semantic.textSecondary} text-sm">This is how questions appear in the designer</p>
      </div>
      
      <!-- Property Panel Section -->
      <div class="{theme.components.container.card} p-4">
        <h3 class="{theme.typography.label} mb-4">Property Panel</h3>
        <div class="{theme.components.propertyPanel.section}">
          <label class="{theme.components.form.label} mb-2 block">Property Name</label>
          <input type="text" class="{theme.components.propertyPanel.input}" placeholder="Enter value..." />
        </div>
        <div class="">
          <label class="{theme.components.form.label} mb-2 block">Another Property</label>
          <select class="{theme.components.form.select}">
            <option>Option A</option>
            <option>Option B</option>
          </select>
        </div>
      </div>
    </div>
    
    <!-- Code Example -->
    <div class="{theme.components.container.section}">
      <div class="flex justify-between items-center mb-4">
        <h2 class="{theme.typography.h2}">Usage Example</h2>
        <button 
          on:click={() => showCode = !showCode}
          class="{theme.components.button.variants.outline} {theme.components.button.sizes.sm} rounded-md"
        >
          {showCode ? 'Hide' : 'Show'} Code
        </button>
      </div>
      
      {#if showCode}
        <pre class="{theme.components.container.well} overflow-x-auto"><code>{`import theme from '$lib/theme';

// Using semantic colors
<div class="{theme.semantic.bgBase} {theme.semantic.textPrimary}">
  Content with theme colors
</div>

// Using component styles
<button class="{theme.components.button.variants.primary} {theme.components.button.sizes.md}">
  Themed Button
</button>

// Using typography
<h1 class="{theme.typography.h1}">Heading</h1>
<p class="{theme.typography.body}">Body text</p>

// Using spacing
<div class="{theme.spacing.stack.md}">
  <item>Spaced items</item>
  <item>Spaced items</item>
</div>`}</code></pre>
      {/if}
    </div>
  </div>
</div>

<style>
  .style-guide {
    min-height: 100vh;
  }
  
  /* Override for demo purposes */
  .style-guide :global(input),
  .style-guide :global(textarea),
  .style-guide :global(select) {
    max-width: 100%;
  }
</style>