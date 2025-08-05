# E2E Tests for Modular Questionnaire System

This directory contains end-to-end tests for the modular questionnaire system using Playwright.

## Test Coverage

### Modular System Tests (`modular-system.spec.ts`)
- Module palette functionality (categories, search, drag & drop)
- Module creation and configuration for all types (questions, instructions, analytics)
- Variable system integration and interpolation
- Conditional logic for showing/hiding modules
- Runtime mode presentation and response collection
- Performance testing (lazy loading, 120 FPS WebGL)

### Offline Functionality Tests (`offline-functionality.spec.ts`)
- Service worker registration and caching
- Offline questionnaire creation and editing
- Module loading from cache
- API call queuing and synchronization
- Conflict resolution when syncing
- Offline state persistence across sessions

## Running Tests

### Prerequisites
```bash
# Install Playwright browsers
pnpm install:browsers

# Create demo user for tests
pnpm mcp:playwright
# Then create user: demo@example.com / demo123456
```

### Run All Tests
```bash
# Run all E2E tests
pnpm test:e2e

# Run in headed mode (see browser)
pnpm test:e2e --headed

# Run specific test file
pnpm test:e2e modular-system.spec.ts

# Run with specific browser
pnpm test:e2e --project=chromium
```

### Debug Tests
```bash
# Debug mode with Playwright Inspector
pnpm test:e2e --debug

# Generate trace for debugging
pnpm test:e2e --trace on
```

### View Test Results
```bash
# Open HTML report
pnpm playwright show-report

# View trace file
pnpm playwright show-trace trace.zip
```

## Test Structure

### Helper Functions (`helpers/`)
- `auth.ts` - Authentication helpers for creating test users and logging in

### Page Objects (TODO)
Consider creating page objects for common interactions:
- `DesignerPage` - Questionnaire designer interactions
- `RuntimePage` - Runtime/preview mode interactions
- `ModulePalette` - Module palette interactions

## Writing New Tests

### Best Practices
1. Use data-testid attributes for reliable element selection
2. Wait for network idle after navigation
3. Use explicit waits instead of hard-coded timeouts
4. Clean up test data after each test
5. Test both online and offline scenarios

### Example Test Structure
```typescript
test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login, navigate, etc.
    await loginTestUser(page);
    await page.goto('/designer');
  });

  test('should do something', async ({ page }) => {
    // Arrange
    await page.click('button:has-text("Add")');
    
    // Act
    await page.fill('input', 'test value');
    
    // Assert
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

## CI/CD Integration

The tests are configured to run in CI with:
- Retries on failure (2 attempts)
- Single worker to avoid flakiness
- Screenshot and video on failure
- HTML report generation

Add to your CI workflow:
```yaml
- name: Run E2E tests
  run: pnpm test:e2e
  env:
    CI: true
```