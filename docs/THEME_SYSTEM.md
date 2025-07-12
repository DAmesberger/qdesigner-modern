# QDesigner Modern Theme System

## Overview

QDesigner Modern uses a unified theme system that combines CSS variables, Tailwind CSS, and TypeScript configuration to ensure consistent UI/UX across the entire application.

## Architecture

The theme system consists of three layers:

1. **CSS Variables** (`src/lib/styles/themes/variables.css`) - Core color definitions
2. **Tailwind Integration** (`tailwind.config.js`) - Maps CSS variables to Tailwind utilities
3. **TypeScript Theme** (`src/lib/theme/index.ts`) - Type-safe theme configuration and utilities

## Usage

### Basic Usage

```typescript
import theme from '$lib/theme';

// Use semantic colors
<div class="{theme.semantic.bgBase} {theme.semantic.textPrimary}">
  Content
</div>

// Use component styles
<button class="{theme.components.button.variants.primary} {theme.components.button.sizes.md}">
  Click me
</button>

// Use typography
<h1 class="{theme.typography.h1}">Heading</h1>
<p class="{theme.typography.body}">Body text</p>

// Use spacing
<div class="{theme.spacing.stack.md}">
  <item>Stacked items</item>
  <item>Stacked items</item>
</div>
```

### Theme Structure

#### Colors
- **Semantic colors**: `theme.semantic.*` - Use these for consistency
  - `bgBase`, `bgSurface`, `bgSubtle`
  - `textPrimary`, `textSecondary`, `textSubtle`
  - `borderDefault`, `borderSubtle`, `borderStrong`
  
#### Components
- **Pre-styled components**: `theme.components.*`
  - `button` - All button variants and sizes
  - `form` - Form elements (input, textarea, select, checkbox)
  - `container` - Cards, sections, wells
  - `badge` - Status badges
  - Designer-specific components

#### Typography
- **Text styles**: `theme.typography.*`
  - Headings: `h1`, `h2`, `h3`, `h4`
  - Body: `body`, `bodyLarge`, `bodySmall`
  - UI: `label`, `caption`, `code`

#### Spacing
- **Consistent spacing**: `theme.spacing.*`
  - Page-level: `page.padding`, `page.maxWidth`
  - Section-level: `section.padding`, `section.margin`
  - Stack spacing: `stack.xs` through `stack.xl`
  - Inline spacing: `inline.xs` through `inline.xl`

## Dark Mode

The theme automatically supports dark mode through the `.dark` class on the HTML element.

```typescript
// Toggle dark mode
theme.utils.toggleDarkMode();

// Check dark mode
const isDark = theme.utils.isDarkMode();

// Use ThemeProvider for automatic management
import ThemeProvider from '$lib/theme/ThemeProvider.svelte';

<ThemeProvider defaultMode="system">
  <App />
</ThemeProvider>
```

## Best Practices

### 1. Use Semantic Colors
Instead of hardcoding colors, always use semantic color tokens:

```svelte
<!-- Good -->
<div class="{theme.semantic.bgSurface} {theme.semantic.textPrimary}">

<!-- Avoid -->
<div class="bg-white text-gray-900">
```

### 2. Use Component Presets
For common components, use the pre-defined styles:

```svelte
<!-- Good -->
<button class="{theme.components.button.variants.primary} {theme.components.button.sizes.md}">

<!-- Avoid -->
<button class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
```

### 3. Consistent Spacing
Use the spacing scale for consistent layouts:

```svelte
<!-- Good -->
<div class="{theme.spacing.stack.md}">
  <section class="{theme.spacing.section.padding}">

<!-- Avoid -->
<div class="space-y-4">
  <section class="p-6">
```

### 4. Focus States
Always include focus states for accessibility:

```svelte
<button class="{theme.components.button.variants.primary} {theme.semantic.focusRing}">
  Accessible Button
</button>
```

## Component Examples

### Designer Question Card
```svelte
<div class="{theme.components.questionCard.base}">
  <h3 class="{theme.typography.label}">Multiple Choice Question</h3>
  <p class="{theme.semantic.textSecondary}">Select one option</p>
</div>
```

### Form Section
```svelte
<div class="{theme.components.container.section}">
  <h2 class="{theme.typography.h3} mb-4">Settings</h2>
  
  <div class="{theme.spacing.stack.md}">
    <div>
      <label class="{theme.components.form.label}">Name</label>
      <input type="text" class="{theme.components.form.input}" />
    </div>
    
    <div>
      <label class="{theme.components.form.label}">Description</label>
      <textarea class="{theme.components.form.textarea}"></textarea>
    </div>
  </div>
</div>
```

### Status Badges
```svelte
<span class="{theme.components.badge.default} {theme.components.badge.primary}">
  Active
</span>
<span class="{theme.components.badge.default} {theme.components.badge.secondary}">
  Draft
</span>
<span class="{theme.components.badge.default} {theme.components.badge.destructive}">
  Error
</span>
```

## Extending the Theme

### Adding Custom Components
```typescript
// In your component
const customStyles = {
  myComponent: {
    base: `${theme.semantic.bgSurface} ${theme.semantic.borderDefault} rounded-lg p-4`,
    header: `${theme.typography.h4} ${theme.semantic.textPrimary} mb-2`,
    content: `${theme.typography.body} ${theme.semantic.textSecondary}`
  }
};
```

### Overriding CSS Variables
```css
/* For specific components */
.my-component {
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
}

/* Globally */
:root {
  --radius: 0.75rem; /* Increase border radius */
}
```

## Style Guide

View the interactive style guide at `/style-guide` (development only) to see all theme elements in action.

## Migration Guide

When updating existing components:

1. Replace hardcoded Tailwind classes with theme tokens
2. Use semantic color names instead of specific colors
3. Apply consistent spacing using the spacing scale
4. Add proper focus states for accessibility
5. Test in both light and dark modes

Example migration:
```svelte
<!-- Before -->
<button class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
  Click me
</button>

<!-- After -->
<button class="{theme.components.button.variants.primary} {theme.components.button.sizes.md} rounded-md {theme.semantic.focusRing}">
  Click me
</button>
```

## Resources

- **Style Guide**: `/style-guide` - Interactive component showcase
- **Theme Config**: `src/lib/theme/index.ts` - Main theme configuration
- **CSS Variables**: `src/lib/styles/themes/variables.css` - Core color definitions
- **Tailwind Config**: `tailwind.config.js` - Tailwind integration