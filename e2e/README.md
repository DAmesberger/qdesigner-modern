# E2E Tests for QDesigner Modern

This directory contains comprehensive end-to-end tests for the QDesigner Modern application using Playwright.

## Test Structure

### Authentication Tests (`auth.spec.ts`)
- Login page redirect for unauthenticated users
- Login form validation
- Error handling for invalid credentials
- User menu and sign out functionality
- Session persistence

### Navigation Tests (`navigation.spec.ts`)
- Sidebar navigation display and functionality
- Active navigation item highlighting
- Navigation between different sections
- Mobile navigation menu
- User dropdown menu
- Click outside handling
- Responsive behavior

### Designer Navigation Tests (`designer-navigation.spec.ts`)
- Page header and questionnaire info display
- Save/load toolbar
- View mode switching (Structure/Visual)
- Left sidebar tabs (Questions/Variables/Flow)
- Properties panel tabs (Properties/Style/Script)
- Empty states
- Undo/redo functionality
- Status bar
- Responsive design for tablet and mobile

### UI Components Tests (`ui-components.spec.ts`)
- Button variants and states
- Card components
- Empty states
- Tab navigation
- Form inputs and styling
- Toggle switches
- Shadow system
- Typography scale
- Color consistency

### WYSIWYG Designer Tests (`wysiwyg-designer.spec.ts`)
- View mode toggling
- Adding questions via drag and drop
- Inline editing
- Properties panel editing
- Question deletion
- Style editor
- Script editor
- Live test runner
- Drag and drop reordering

### User Journey Tests (`user-journey.spec.ts`)
- Complete workflow from login to questionnaire creation
- State persistence across reloads
- Navigation error handling
- State maintenance when switching view modes

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test suites
pnpm test:e2e:auth          # Authentication tests only
pnpm test:e2e:navigation    # Navigation tests only
pnpm test:e2e:components    # UI component tests only
pnpm test:e2e:journey       # User journey tests only

# Run tests in UI mode (interactive)
pnpm test:e2e:ui

# Run tests in headed mode (see browser)
pnpm test:e2e:headed

# Debug tests
pnpm test:e2e:debug
```

## Test Fixtures

### Authentication Mock (`fixtures/auth.ts`)
Helper functions to mock Supabase authentication for tests:
- `mockAuth(page)` - Sets up authenticated user state
- `clearAuth(page)` - Clears authentication state

## Writing New Tests

1. Import necessary utilities:
```typescript
import { test, expect } from '@playwright/test';
import { mockAuth } from './fixtures/auth';
```

2. Set up authentication if needed:
```typescript
test.beforeEach(async ({ page }) => {
  await mockAuth(page);
  await page.goto('/design');
});
```

3. Write descriptive test cases:
```typescript
test('should perform expected behavior', async ({ page }) => {
  // Arrange
  await page.click('button:has-text("Action")');
  
  // Act
  const result = page.locator('.result');
  
  // Assert
  await expect(result).toBeVisible();
});
```

## Best Practices

1. **Use data-testid attributes** for reliable element selection when possible
2. **Test user workflows** not implementation details
3. **Keep tests independent** - each test should set up its own state
4. **Use descriptive test names** that explain what is being tested
5. **Test responsive behavior** with different viewports
6. **Mock external dependencies** like authentication
7. **Wait for elements** to be visible/ready before interacting
8. **Use Page Object Model** for complex pages (future improvement)

## Debugging Failed Tests

1. Run with `--debug` flag for step-by-step debugging
2. Use `--headed` to see the browser
3. Check test reports in `playwright-report/`
4. Use `page.screenshot()` to capture state at failure
5. Enable trace recording for detailed debugging

## CI/CD Integration

Tests are configured to run in CI with:
- Retry logic for flaky tests
- Parallel execution disabled for consistency
- HTML reports generated
- Trace recording on first retry