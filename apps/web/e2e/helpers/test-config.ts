/**
 * E2E Test Configuration
 */

import { DEV_URLS } from './dev-urls';

export const TEST_CONFIG = {
  // Test credentials
  users: {
    admin: {
      email: 'admin@test.local',
      password: 'TestPassword123!',
      uuid: '11111111-1111-1111-1111-111111111111',
    },
    editor: {
      email: 'editor@test.local',
      password: 'TestPassword123!',
      uuid: '22222222-2222-2222-2222-222222222222',
    },
    viewer: {
      email: 'viewer@test.local',
      password: 'TestPassword123!',
      uuid: '33333333-3333-3333-3333-333333333333',
    },
    participant: {
      email: 'participant@test.local',
      password: 'TestPassword123!',
      uuid: '44444444-4444-4444-4444-444444444444',
    },
    demo: {
      email: 'demo@example.com',
      password: 'demo123456',
      uuid: '55555555-5555-5555-5555-555555555555',
    },
  },

  // Test organization
  organization: {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Test Organization',
    slug: 'test-org',
  },

  // Test project
  project: {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Test Project',
    code: 'TEST001',
  },

  // URLs
  urls: {
    frontend: DEV_URLS.frontend,
    backend: DEV_URLS.backend,
    wsBackend: DEV_URLS.wsBackend,
  },

  // Timeouts
  timeouts: {
    navigation: 15000,
    api: 10000,
    animation: 500,
  },

  // Viewport
  viewport: {
    width: 1280,
    height: 720,
  },
};

/**
 * Get a test user by role
 */
export function getTestUser(role: keyof typeof TEST_CONFIG.users) {
  return TEST_CONFIG.users[role];
}

/**
 * Generate a unique test email address
 */
export function generateTestEmail(prefix = 'test'): string {
  return `${prefix}+${Date.now()}@test.local`;
}

/**
 * Generate test data for a new user
 */
export function generateUserData(prefix?: string) {
  const timestamp = Date.now();
  const emailPrefix = prefix || 'test';

  return {
    email: `${emailPrefix}+${timestamp}@test.local`,
    password: TEST_CONFIG.users.admin.password,
    fullName: `Test User ${timestamp}`,
    id: `test-user-${timestamp}`,
  };
}

/**
 * Generate test data for an organization
 */
export function generateOrganizationData() {
  const timestamp = Date.now();

  return {
    name: `Test Org ${timestamp}`,
    slug: `test-org-${timestamp}`,
    id: `test-org-${timestamp}`,
  };
}

/**
 * Viewport configurations for responsive testing
 */
export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
  wide: { width: 1920, height: 1080 },
};
