# E2E Tests for QDesigner Modern

This directory contains comprehensive end-to-end tests for the QDesigner Modern application using Playwright.

## Architecture

### Setup

- **`setup/global-setup.ts`** - Runs before all tests. Waits for the Rust backend to be ready and verifies seeded test users can log in.
- **`setup/auth.setup.ts`** - Playwright setup project. Logs in as each test role (admin, editor, viewer) through the actual login UI and saves browser storage state to `.auth/` files.

### Auth Storage States

Tests use per-role storage states saved by the auth setup project:

- `.auth/admin.json` - Admin user session (admin@test.local)
- `.auth/editor.json` - Editor user session (editor@test.local)
- `.auth/viewer.json` - Viewer user session (viewer@test.local)

### Helpers

- **`helpers/test-config.ts`** - Centralized test configuration (users, URLs, timeouts, organization/project IDs)
- **`helpers/api-client.ts`** - Direct API client for test data setup (bypasses frontend, talks to Rust backend)
- **`helpers/auth.ts`** - Auth helper functions (login via UI, mock auth, signup flow)
- **`helpers/test-setup.ts`** - Test setup utilities (create users, organizations, fixtures)

## Test Structure

### Authentication Tests (`auth.spec.ts`)
- Login page redirect for unauthenticated users
- Login form validation
- Error handling for invalid credentials
- User menu and sign out functionality

### Navigation Tests (`navigation.spec.ts`)
- Sidebar navigation display and functionality
- Active navigation item highlighting
- Navigation between different sections
- Mobile navigation menu
- User dropdown menu

### Designer Navigation Tests (`designer-navigation.spec.ts`)
- Page header and questionnaire info display
- Save/load toolbar
- View mode switching (Structure/Visual)
- Left sidebar tabs (Questions/Variables/Flow)
- Properties panel tabs (Properties/Style/Script)
- Empty states, undo/redo, status bar
- Responsive design for tablet and mobile

### UI Components Tests (`ui-components.spec.ts`)
- Button variants and states
- Card components and empty states
- Tab navigation and form inputs
- Toggle switches, shadows, typography, colors

### WYSIWYG Designer Tests (`wysiwyg-designer.spec.ts`)
- View mode toggling
- Adding questions via drag and drop
- Inline editing and properties panel editing
- Style editor, script editor, live test runner
- Drag and drop reordering

### User Journey Tests (`user-journey.spec.ts`)
- Complete workflow from login to questionnaire creation
- State persistence across reloads
- Navigation error handling

### Onboarding Tests (`onboarding.spec.ts`, `onboarding-advanced.spec.ts`)
- Self-service signup flow
- Invitation flows
- Domain auto-join
- Error handling, security, accessibility

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test file
npx playwright test e2e/auth.spec.ts

# Run tests by project (role)
npx playwright test --project=admin
npx playwright test --project=unauthenticated

# Run tests in UI mode (interactive)
npx playwright test --ui

# Run tests in headed mode (see browser)
npx playwright test --headed

# Debug tests
npx playwright test --debug
```

## Writing New Tests

1. For authenticated tests, use the `storageState` from the setup project:
```typescript
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test.use({ storageState: '.auth/admin.json' });

  test('should work when authenticated', async ({ page }) => {
    await page.goto('/design');
    // ...
  });
});
```

2. For unauthenticated tests (login, signup), use no storageState:
```typescript
test.describe('Public Page', () => {
  test('should show login form', async ({ page }) => {
    await page.goto('/login');
    // ...
  });
});
```

3. For API-level test data setup, use the TestApiClient:
```typescript
import { createTestClient } from './helpers/api-client';

const api = createTestClient();
await api.login('admin@test.local', 'TestPassword123!');
await api.createProject(orgId, 'My Project', 'PROJ001');
```

## Test Users (seeded)

| Role        | Email                  | Password          |
|-------------|------------------------|--------------------|
| Admin       | admin@test.local       | TestPassword123!   |
| Editor      | editor@test.local      | TestPassword123!   |
| Viewer      | viewer@test.local      | TestPassword123!   |
| Participant | participant@test.local | TestPassword123!   |
| Demo        | demo@example.com       | demo123456         |

## Debugging Failed Tests

1. Run with `--debug` flag for step-by-step debugging
2. Use `--headed` to see the browser
3. Check test reports in `playwright-report/`
4. Use `page.screenshot()` to capture state at failure
5. Enable trace recording for detailed debugging

## CI/CD Integration

Tests are configured to run in CI with:
- Global setup verifies backend readiness before running tests
- Auth setup project runs first, saving storage states
- Retry logic for flaky tests (2 retries in CI)
- Parallel execution disabled in CI for consistency
- HTML reports generated
- Trace recording on first retry
