import { Page } from '@playwright/test';
import { TEST_CONFIG } from './test-config';
import { createTestClient, TestApiClient } from './api-client';
import { loginUser } from './auth';

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

/**
 * Create a test user via the API client.
 * Note: In the new backend, test users are seeded. This helper is for
 * tests that need dynamically created users.
 */
export async function createTestUser(options: {
  email?: string;
  password?: string;
  role?: ExtendedTestUser['role'];
  organizationId?: string;
  name?: string;
  department?: string;
}): Promise<ExtendedTestUser> {
  const email = options.email || `test-${Date.now()}@test.local`;
  const password = options.password || 'TestPassword123!';
  const role = options.role || 'participant';
  const name = options.name || 'Test User';

  // For seeded test users, return the config directly
  const seededUsers = TEST_CONFIG.users;
  for (const [key, user] of Object.entries(seededUsers)) {
    if (user.email === email) {
      return {
        id: user.uuid,
        email: user.email,
        password: user.password,
        role: key as ExtendedTestUser['role'],
        organizationId: options.organizationId,
        name,
        department: options.department,
      };
    }
  }

  // For non-seeded users, return a placeholder
  // These users would need to be created via the signup flow in actual tests
  return {
    id: `user-${Date.now()}`,
    email,
    password,
    role,
    organizationId: options.organizationId,
    name,
    department: options.department,
  };
}

/**
 * Set up a complete test organization using seeded data
 */
export async function setupTestOrganization(orgName?: string): Promise<{
  organization: TestOrganization;
  project: TestProject;
  owner: ExtendedTestUser;
}> {
  const organization: TestOrganization = {
    id: TEST_CONFIG.organization.id,
    name: orgName || TEST_CONFIG.organization.name,
    slug: TEST_CONFIG.organization.slug,
  };

  const owner = await createTestUser({
    email: TEST_CONFIG.users.admin.email,
    role: 'admin',
    organizationId: organization.id,
    name: 'Test Admin',
  });

  const project: TestProject = {
    id: TEST_CONFIG.project.id,
    name: TEST_CONFIG.project.name,
    organizationId: organization.id,
  };

  return {
    organization,
    project,
    owner,
  };
}

// Re-export loginUser for backward compatibility
export { loginUser };

/**
 * Helper to wait for real-time updates via WebSocket
 */
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

/**
 * Helper to simulate network conditions
 */
export async function simulateSlowNetwork(page: Page) {
  await page.route('**/*', async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.continue();
  });
}

/**
 * Helper to create test fixtures
 */
export function createTestFixtures() {
  return {
    testLogo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    testDocument: 'data:application/pdf;base64,JVBERi0xLjMKJeLjz9MKCg==',
    testData: {
      demographics: {
        age: 25,
        gender: 'male',
        education: 'bachelors',
      },
      responses: {
        q1: 'Test response',
        q2: 3,
        q3: true,
      },
    },
  };
}
