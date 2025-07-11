# QDesigner UI Components

A comprehensive set of Tailwind-based UI components for the QDesigner Modern platform.

## Overview

This UI library provides a consistent, accessible, and beautiful set of components that power all three main interfaces of QDesigner:
- **Designer**: The questionnaire creation interface
- **Fillout**: The participant-facing interface
- **Admin**: The management dashboard

## Component Categories

### Layout Components
- `AppShell`: Main application wrapper with navigation
- `PageHeader`: Consistent page headers with breadcrumbs
- `Container`: Responsive content container

### Form Components
- `Input`: Text input with multiple types and states
- `Select`: Dropdown select component
- `Checkbox`: Styled checkbox with label support
- `TextArea`: Multi-line text input
- `FormGroup`: Form field wrapper with labels and validation

### Data Display
- `Table`: Sortable data table with actions
- `Badge`: Status badges with multiple variants

### Feedback Components
- `Alert`: Alert messages with variants
- `Modal`: Dialog modals
- `Spinner`: Loading indicators

### Common Components
- `Button`: Buttons with variants and sizes
- `Card`: Content card container
- `EmptyState`: Empty state placeholder
- `Tabs`: Tab navigation
- `Toggle`: Toggle switches

## Usage

### Import Components

```svelte
<script>
  import { Button, Card, Input, Alert } from '$lib/components/ui';
</script>
```

### Button Examples

```svelte
<!-- Primary button -->
<Button variant="primary" size="md">Click me</Button>

<!-- Secondary button -->
<Button variant="secondary">Secondary</Button>

<!-- Ghost button -->
<Button variant="ghost">Ghost</Button>

<!-- Loading state -->
<Button loading>Processing...</Button>

<!-- Disabled state -->
<Button disabled>Disabled</Button>

<!-- As link -->
<Button href="/designer">Go to Designer</Button>
```

### Form Example

```svelte
<FormGroup label="Email Address" required error={emailError}>
  <Input 
    type="email" 
    bind:value={email}
    placeholder="email@example.com"
    error={!!emailError}
  />
</FormGroup>
```

### Alert Example

```svelte
<Alert variant="success" title="Success!" dismissible>
  Your questionnaire has been saved successfully.
</Alert>
```

### Table Example

```svelte
<Table 
  columns={[
    { key: 'name', label: 'Name', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'date', label: 'Date', sortable: true }
  ]}
  data={questionnaires}
>
  <div slot="cell" let:column let:value>
    {#if column.key === 'status'}
      <Badge variant={getStatusColor(value)}>{value}</Badge>
    {:else}
      {value}
    {/if}
  </div>
  
  <div slot="actions" let:row>
    <Button size="sm" variant="ghost">Edit</Button>
  </div>
</Table>
```

## Design Principles

1. **Consistency**: All components follow the same visual language
2. **Accessibility**: WCAG 2.1 AA compliant with proper ARIA labels
3. **Responsiveness**: Mobile-first design that works on all devices
4. **Performance**: Optimized for fast rendering and minimal bundle size
5. **Customizability**: Easy to extend with Tailwind classes

## Theming

The components use a centralized theme configuration that defines:
- Color palette (primary, gray, success, warning, error)
- Typography scale
- Spacing system
- Border radius values
- Shadow presets
- Animation timings

See `/src/lib/styles/theme.ts` for the complete theme configuration.

## Best Practices

1. **Use semantic variants**: Choose button and badge variants that match their purpose
2. **Provide feedback**: Use loading states and error messages
3. **Be consistent**: Use the same patterns throughout the application
4. **Test accessibility**: Ensure keyboard navigation and screen reader support
5. **Optimize performance**: Lazy load heavy components when possible

## Development

To view all components in action:
```bash
pnpm dev
# Navigate to http://localhost:5173/ui-components
```

## Contributing

When adding new components:
1. Follow the existing component structure
2. Include TypeScript types for all props
3. Add the component to the index.ts export
4. Document usage in this README
5. Add examples to the UI components showcase page