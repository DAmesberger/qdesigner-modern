# QDesigner Modern Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for QDesigner Modern, focusing on real-world testing with actual Supabase instances (no mocking) to ensure production-like behavior.

## Testing Philosophy

- **No Mocking**: All tests run against real Supabase instances via Docker
- **Test Isolation**: Each test suite gets its own database schema/namespace
- **Real-Time Testing**: Test actual WebSocket connections and real-time features
- **Performance Validation**: Ensure microsecond-accurate timing requirements are met
- **Offline-First**: Comprehensive testing of offline capabilities and sync

## Test Categories

### 1. Unit Tests (Vitest)
Fast, focused tests for individual components and utilities.

#### Coverage Areas:
- **Variable Engine**: Formula evaluation, dependency tracking
- **Rendering Engine**: WebGL setup, frame timing
- **Offline Storage**: IndexedDB operations, sync queue logic
- **State Management**: Store updates, derived state
- **Utilities**: Data transformations, validation

#### Test Structure:
```typescript
// packages/scripting-engine/src/evaluator.test.ts
describe('Variable Engine', () => {
  describe('Formula Evaluation', () => {
    test('evaluates mathematical expressions', async () => {
      const engine = new VariableEngine();
      const result = await engine.evaluate('2 + 2 * 3');
      expect(result).toBe(8);
    });
  });
});
```

### 2. Integration Tests (Vitest + Supabase)
Tests that verify component interactions with real database.

#### Coverage Areas:
- **Database Operations**: CRUD with real Supabase
- **Authentication**: Login/logout flows, session management
- **Real-time Subscriptions**: Live updates, presence
- **File Storage**: Media uploads/downloads
- **Offline Sync**: Conflict resolution, queue processing

#### Test Structure:
```typescript
// tests/integration/questionnaire-persistence.test.ts
describe('Questionnaire Persistence', () => {
  let testDb: SupabaseTestInstance;
  
  beforeEach(async () => {
    testDb = await createTestDatabase();
  });
  
  afterEach(async () => {
    await testDb.cleanup();
  });
  
  test('saves questionnaire with version history', async () => {
    const user = await testDb.createTestUser();
    const questionnaire = createTestQuestionnaire();
    
    const saved = await QuestionnairePersistence.save(questionnaire, user.id);
    expect(saved.version).toBe(1);
    
    // Verify in database
    const stored = await testDb.client
      .from('questionnaire_definitions')
      .select('*')
      .eq('id', saved.id)
      .single();
      
    expect(stored.data).toMatchObject({
      version: 1,
      definition: questionnaire
    });
  });
});
```

### 3. E2E Tests (Playwright)
Full user journey tests running against the complete application.

#### Coverage Areas:
- **Designer Workflows**: Create, edit, save questionnaires
- **Offline Scenarios**: Work offline, sync when online
- **Participant Experience**: Take questionnaires, timing accuracy
- **Authentication**: Sign up, login, password reset
- **Version Management**: Create versions, publish, rollback
- **Command Palette**: Keyboard shortcuts, command execution

#### Test Structure:
```typescript
// e2e/offline-sync.spec.ts
test.describe('Offline Sync', () => {
  test('continues working offline and syncs on reconnect', async ({ page, context }) => {
    // Start online
    await page.goto('/designer');
    await page.waitForSelector('[data-testid="designer-canvas"]');
    
    // Create questionnaire
    await page.click('[data-testid="add-page"]');
    await page.fill('[data-testid="page-title"]', 'Test Page');
    
    // Go offline
    await context.setOffline(true);
    await page.waitForSelector('[data-testid="offline-indicator"]');
    
    // Continue editing
    await page.click('[data-testid="add-question"]');
    await page.fill('[data-testid="question-text"]', 'Offline Question');
    
    // Verify saved locally
    const saved = await page.evaluate(() => 
      localStorage.getItem('qdesigner_offline_draft')
    );
    expect(saved).toContain('Offline Question');
    
    // Go online
    await context.setOffline(false);
    await page.waitForSelector('[data-testid="sync-complete"]');
    
    // Verify synced to server
    const response = await page.request.get('/api/questionnaires/current');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.questions[0].text).toBe('Offline Question');
  });
});
```

### 4. Performance Tests
Validate timing accuracy and rendering performance.

#### Coverage Areas:
- **Reaction Time Accuracy**: Microsecond precision validation
- **Frame Rate**: Consistent 120 FPS rendering
- **Load Time**: Initial load and navigation speed
- **Memory Usage**: No memory leaks during long sessions
- **Concurrent Users**: Database performance under load

#### Test Structure:
```typescript
// tests/performance/timing-accuracy.test.ts
test('maintains microsecond timing accuracy', async ({ page }) => {
  await page.goto('/runtime/test');
  
  // Inject timing measurement
  const timings = await page.evaluate(async () => {
    const measurements = [];
    
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await new Promise(r => requestAnimationFrame(r));
      const end = performance.now();
      measurements.push(end - start);
    }
    
    return {
      mean: measurements.reduce((a, b) => a + b) / measurements.length,
      max: Math.max(...measurements),
      min: Math.min(...measurements)
    };
  });
  
  // Verify sub-millisecond precision
  expect(timings.mean).toBeLessThan(17); // 60 FPS minimum
  expect(timings.max - timings.min).toBeLessThan(5); // Consistent timing
});
```

## Test Infrastructure

### 1. Supabase Test Instance
```typescript
// tests/utils/supabase-test.ts
export class SupabaseTestInstance {
  private schema: string;
  public client: SupabaseClient;
  
  constructor() {
    this.schema = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        db: { schema: this.schema },
        auth: { persistSession: false }
      }
    );
  }
  
  async setup() {
    // Create isolated schema
    await this.client.rpc('create_test_schema', { 
      schema_name: this.schema 
    });
    
    // Run migrations
    await this.runMigrations();
  }
  
  async cleanup() {
    await this.client.rpc('drop_test_schema', { 
      schema_name: this.schema 
    });
  }
  
  async createTestUser(role = 'participant') {
    const email = `test_${Date.now()}@example.com`;
    const { data } = await this.client.auth.admin.createUser({
      email,
      password: 'test123456',
      email_confirm: true,
      user_metadata: { role }
    });
    return data.user;
  }
}
```

### 2. Test Data Factories
```typescript
// tests/factories/questionnaire.factory.ts
export function createTestQuestionnaire(overrides = {}) {
  return {
    id: `test_q_${Date.now()}`,
    name: 'Test Questionnaire',
    description: 'Created for testing',
    version: 1,
    pages: [
      {
        id: `test_p_${Date.now()}`,
        title: 'Test Page',
        blocks: [],
        order: 0
      }
    ],
    questions: [],
    variables: [],
    settings: {
      allowBackNavigation: true,
      showProgressBar: true
    },
    ...overrides
  };
}
```

### 3. Test Helpers
```typescript
// tests/helpers/offline.ts
export async function simulateOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

export async function waitForSync(page: Page) {
  await page.waitForFunction(() => {
    const queue = window.__syncQueue;
    return queue && queue.length === 0;
  }, { timeout: 10000 });
}
```

## Test Execution

### Local Development
```bash
# Run all tests
pnpm test:all

# Unit tests only
pnpm test:unit

# Integration tests with real Supabase
pnpm test:integration

# E2E tests
pnpm test:e2e

# Performance tests
pnpm test:perf

# Watch mode for development
pnpm test:watch
```

### CI/CD Pipeline
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      supabase:
        image: supabase/postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Setup Supabase
        run: |
          pnpm supabase start
          pnpm supabase db reset
      
      - name: Run tests
        run: |
          pnpm test:unit
          pnpm test:integration
          pnpm test:e2e
          pnpm test:perf
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

## Test Coverage Requirements

- **Unit Tests**: 80% coverage minimum
- **Integration Tests**: All database operations covered
- **E2E Tests**: All critical user paths covered
- **Performance Tests**: All timing-critical features validated

## Monitoring & Reporting

### Test Reports
- HTML coverage reports for unit tests
- Video recordings for failed E2E tests
- Performance metrics dashboard
- Test execution time trends

### Alerts
- Slack notifications for test failures
- Performance regression alerts
- Coverage drop warnings

## Best Practices

1. **Test Naming**: Use descriptive names that explain the scenario
2. **Test Isolation**: Each test should be independent
3. **Test Data**: Use factories, avoid hardcoded values
4. **Assertions**: Test behavior, not implementation
5. **Performance**: Keep tests fast, parallelize when possible
6. **Debugging**: Use test.only() for focused debugging
7. **Cleanup**: Always clean up test data/state

## Future Enhancements

1. **Visual Regression Tests**: Screenshot comparison for UI changes
2. **Accessibility Tests**: Automated a11y validation
3. **Security Tests**: Penetration testing, SQL injection prevention
4. **Chaos Engineering**: Random failure injection
5. **Multi-browser Testing**: Safari, Firefox, Edge coverage