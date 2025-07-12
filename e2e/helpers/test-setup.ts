import { Page } from '@playwright/test';

// Extend the existing TestUser interface
export interface ExtendedTestUser {
  id: string;
  email: string;
  password: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'participant';
  organizationId?: string;
  name?: string;
  department?: string;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface TestProject {
  id: string;
  name: string;
  organizationId: string;
}

// Mock Supabase client for testing
class MockSupabaseClient {
  auth = {
    signUp: async (params: any) => {
      const userId = `user-${Date.now()}`;
      return {
        data: {
          user: {
            id: userId,
            email: params.email,
            user_metadata: params.options?.data || {}
          }
        },
        error: null
      };
    },
    admin: {
      updateUser: async (userId: string, updates: any) => {
        return { data: { user: { id: userId, ...updates } }, error: null };
      }
    }
  };
  
  from(table: string) {
    return {
      insert: (data: any) => ({
        select: () => ({
          single: async () => ({ data, error: null })
        }),
        execute: async () => ({ data, error: null })
      }),
      delete: () => ({
        eq: () => ({ execute: async () => ({ error: null }) })
      })
    };
  }
}

// Mock supabase instance
const mockSupabase = new MockSupabaseClient();

// Create a test user with proper setup
export async function createTestUser(options: {
  email?: string;
  password?: string;
  role?: ExtendedTestUser['role'];
  organizationId?: string;
  name?: string;
  department?: string;
}): Promise<ExtendedTestUser> {
  const email = options.email || `test-${Date.now()}@example.com`;
  const password = options.password || 'TestPassword123!';
  const role = options.role || 'participant';
  const name = options.name || 'Test User';
  
  // In a real implementation, this would use the actual Supabase client
  const { data: authData } = await mockSupabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role,
        organization_id: options.organizationId,
        department: options.department
      }
    }
  });
  
  return {
    id: authData!.user!.id,
    email,
    password,
    role,
    organizationId: options.organizationId,
    name,
    department: options.department
  };
}

// Login helper for E2E tests
export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', email);
  await page.fill('[data-testid="password"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

// Set up a complete test organization
export async function setupTestOrganization(orgName?: string): Promise<{
  organization: TestOrganization;
  project: TestProject;
  owner: ExtendedTestUser;
}> {
  const timestamp = Date.now();
  const organization: TestOrganization = {
    id: `org-${timestamp}`,
    name: orgName || `Test Organization ${timestamp}`,
    slug: `test-org-${timestamp}`
  };
  
  // Create owner user
  const owner = await createTestUser({
    email: `owner-${timestamp}@example.com`,
    role: 'owner',
    organizationId: organization.id,
    name: 'Test Owner'
  });
  
  // Create default project
  const project: TestProject = {
    id: `proj-${timestamp}`,
    name: 'Default Test Project',
    organizationId: organization.id
  };
  
  return {
    organization,
    project,
    owner
  };
}

// Helper to create test study data
export async function createTestStudyWithData(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/studies/new`);
  
  // Create study
  await page.fill('[data-testid="study-name"]', 'Test Study with Data');
  await page.fill('[data-testid="study-description"]', 'Automated test study');
  await page.click('[data-testid="create-study"]');
  
  // Add sample questions
  await page.click('[data-testid="add-question"]');
  await page.selectOption('[data-testid="question-type"]', 'text');
  await page.fill('[data-testid="question-text"]', 'Test question 1');
  
  await page.click('[data-testid="add-question"]');
  await page.selectOption('[data-testid="question-type"]', 'single_choice');
  await page.fill('[data-testid="question-text"]', 'Test question 2');
  
  // Save
  await page.click('[data-testid="save-study"]');
  
  // Generate test data
  await page.click('[data-testid="generate-test-data"]');
  await page.fill('[data-testid="num-responses"]', '100');
  await page.click('[data-testid="generate"]');
  
  return page.url().split('/').pop(); // Return study ID
}

// Helper to wait for real-time updates
export async function waitForRealtimeUpdate(page: Page, eventType: string, timeout = 5000) {
  await page.waitForFunction(
    (expectedEvent) => {
      const events = (window as any).__realtimeEvents || [];
      return events.some((e: any) => e.type === expectedEvent);
    },
    eventType,
    { timeout }
  );
}

// Mock Stripe payment for testing
export async function mockStripePayment(page: Page) {
  await page.addInitScript(() => {
    (window as any).Stripe = () => ({
      elements: () => ({
        create: () => ({
          mount: () => {},
          on: () => {},
          update: () => {}
        })
      }),
      confirmCardPayment: async () => ({
        paymentIntent: { id: 'pi_test_123', status: 'succeeded' }
      })
    });
  });
}

// Helper to simulate network conditions
export async function simulateSlowNetwork(page: Page) {
  await page.route('**/*', async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.continue();
  });
}

// Helper to create test fixtures
export function createTestFixtures() {
  return {
    testLogo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    testDocument: 'data:application/pdf;base64,JVBERi0xLjMKJeLjz9MKCg==',
    testData: {
      demographics: {
        age: 25,
        gender: 'male',
        education: 'bachelors'
      },
      responses: {
        q1: 'Test response',
        q2: 3,
        q3: true
      }
    }
  };
}