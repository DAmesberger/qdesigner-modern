import { Page } from '@playwright/test';
// Mock Supabase for now - in real implementation, use proper import
// import { supabase } from '$lib/supabase';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/**
 * Create a test user for E2E tests
 */
export async function createTestUser(): Promise<TestUser> {
  const timestamp = Date.now();
  const email = `test-${timestamp}@example.com`;
  const password = 'testpass123456';
  
  // For E2E tests, we'll use the demo user that should already exist
  // In a real implementation, this would create a user via Supabase Admin API
  return {
    id: `test-user-${timestamp}`,
    email: 'demo@example.com',
    password: 'demo123456'
  };
}

/**
 * Login test user
 */
export async function loginTestUser(page: Page, email = 'demo@example.com', password = 'demo123456') {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  
  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard');
}

/**
 * Cleanup test data
 */
export async function cleanupTestData(userId: string) {
  // In a real implementation, this would delete test data via Supabase Admin API
  console.log(`Would cleanup test data for user: ${userId}`);
}