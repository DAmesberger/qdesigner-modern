// Unified Theme System for QDesigner Modern
// This integrates CSS variables, Tailwind classes, and TypeScript theme configuration

import type { QuestionnaireTheme } from '$lib/shared/types/theme';

// CSS Variable names mapping
export const cssVariables = {
  colors: {
    background: 'var(--background)',
    foreground: 'var(--foreground)',
    card: 'var(--card)',
    cardForeground: 'var(--card-foreground)',
    popover: 'var(--popover)',
    popoverForeground: 'var(--popover-foreground)',
    primary: 'var(--primary)',
    primaryForeground: 'var(--primary-foreground)',
    secondary: 'var(--secondary)',
    secondaryForeground: 'var(--secondary-foreground)',
    muted: 'var(--muted)',
    mutedForeground: 'var(--muted-foreground)',
    accent: 'var(--accent)',
    accentForeground: 'var(--accent-foreground)',
    destructive: 'var(--destructive)',
    destructiveForeground: 'var(--destructive-foreground)',
    border: 'var(--border)',
    input: 'var(--input)',
    ring: 'var(--ring)',
  },
  radius: 'var(--radius)',
} as const;

// Semantic color mapping for designer components
export const semanticColors = {
  // Background layers
  bgBase: 'bg-background',
  bgSurface: 'bg-card',
  bgSubtle: 'bg-muted',
  bgHover: 'hover:bg-muted',
  
  // Text colors
  textPrimary: 'text-foreground',
  textSecondary: 'text-muted-foreground',
  textSubtle: 'text-muted-foreground/70',
  
  // Borders
  borderDefault: 'border-border',
  borderSubtle: 'border-border/50',
  borderStrong: 'border-foreground/20',
  
  // Interactive states
  interactive: {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  },
  
  // Focus states
  focusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  
  // Status colors
  status: {
    error: 'text-destructive',
    warning: 'text-yellow-600 dark:text-yellow-500',
    success: 'text-green-600 dark:text-green-500',
    info: 'text-blue-600 dark:text-blue-500',
  }
} as const;

// Component-specific theme classes
export const componentTheme = {
  // Designer components
  designerCanvas: {
    base: 'bg-muted/30',
    grid: 'bg-[url("/grid.svg")] bg-center',
  },
  
  designerSidebar: {
    base: 'bg-card border-r border-border',
    header: 'border-b border-border bg-muted/50',
  },
  
  questionCard: {
    base: 'bg-card border border-border rounded-lg shadow-sm hover:shadow-md transition-shadow',
    selected: 'ring-2 ring-primary ring-offset-2',
    dragging: 'opacity-50',
  },
  
  propertyPanel: {
    base: 'bg-card border-l border-border',
    section: 'border-b border-border/50 pb-4 mb-4',
    input: 'bg-background border border-input rounded-md px-3 py-2 text-sm',
  },
  
  // Buttons
  button: {
    sizes: {
      sm: 'h-8 px-3 text-xs',
      md: 'h-9 px-4 text-sm',
      lg: 'h-10 px-6',
    },
    variants: {
      default: semanticColors.interactive.primary,
      secondary: semanticColors.interactive.secondary,
      ghost: semanticColors.interactive.ghost,
      outline: semanticColors.interactive.outline,
      destructive: semanticColors.interactive.destructive,
    }
  },
  
  // Forms
  form: {
    label: 'text-sm font-medium text-foreground',
    input: 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    textarea: 'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    select: 'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    checkbox: 'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
  },
  
  // Cards and containers
  container: {
    card: 'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
    section: 'rounded-lg border border-border bg-background p-6',
    well: 'rounded-lg bg-muted/50 p-4',
  },
  
  // Modals and overlays
  modal: {
    overlay: 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
    content: 'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 sm:rounded-lg',
  },
  
  // Tooltips
  tooltip: {
    base: 'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95',
  },
  
  // Badges
  badge: {
    default: 'inline-flex items-center rounded-md border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    primary: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
    outline: 'text-foreground',
  },
  
  // Animations
  animation: {
    fadeIn: 'animate-in fade-in duration-200',
    fadeOut: 'animate-out fade-out duration-200',
    slideIn: 'animate-in slide-in-from-bottom duration-200',
    slideOut: 'animate-out slide-out-to-bottom duration-200',
  }
} as const;

// Typography scale
export const typography = {
  // Headings
  h1: 'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl',
  h2: 'scroll-m-20 text-3xl font-semibold tracking-tight',
  h3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
  h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
  
  // Body text
  body: 'leading-7',
  bodyLarge: 'text-lg leading-7',
  bodySmall: 'text-sm leading-6',
  
  // UI text
  label: 'text-sm font-medium',
  caption: 'text-xs text-muted-foreground',
  code: 'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm',
  
  // Links
  link: 'font-medium text-primary underline underline-offset-4 hover:no-underline',
} as const;

// Spacing utilities
export const spacing = {
  // Page spacing
  page: {
    padding: 'p-4 sm:p-6 lg:p-8',
    maxWidth: 'max-w-7xl mx-auto',
  },
  
  // Section spacing
  section: {
    padding: 'p-6',
    margin: 'my-8',
    gap: 'space-y-6',
  },
  
  // Component spacing
  component: {
    padding: 'p-4',
    margin: 'my-4',
    gap: 'space-y-4',
  },
  
  // Stack spacing
  stack: {
    xs: 'space-y-1',
    sm: 'space-y-2',
    md: 'space-y-4',
    lg: 'space-y-6',
    xl: 'space-y-8',
  },
  
  // Inline spacing
  inline: {
    xs: 'space-x-1',
    sm: 'space-x-2',
    md: 'space-x-4',
    lg: 'space-x-6',
    xl: 'space-x-8',
  }
} as const;

// Theme utilities
export const theme = {
  colors: cssVariables.colors,
  semantic: semanticColors,
  components: componentTheme,
  typography,
  spacing,
  
  // Helper functions
  utils: {
    // Get CSS variable value
    getCssVariable(name: string): string {
      return getComputedStyle(document.documentElement).getPropertyValue(name);
    },
    
    // Set CSS variable
    setCssVariable(name: string, value: string): void {
      document.documentElement.style.setProperty(name, value);
    },
    
    // Toggle dark mode
    toggleDarkMode(): void {
      document.documentElement.classList.toggle('dark');
    },
    
    // Check if dark mode
    isDarkMode(): boolean {
      return document.documentElement.classList.contains('dark');
    }
  }
} as const;

// Export type-safe theme
export type Theme = typeof theme;

// Default export
export default theme;