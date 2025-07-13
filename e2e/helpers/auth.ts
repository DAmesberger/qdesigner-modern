import { Page } from '@playwright/test';

export interface TestUser {
  id: string;
  email: string;
  fullName: string;
  organizationId?: string;
  role?: string;
}

/**
 * Generate a unique test email address
 */
export function generateTestEmail(prefix = 'test'): string {
  return `${prefix}+${Date.now()}@test.local`;
}

/**
 * Extract verification code from console logs
 */
export async function getVerificationCode(page: Page): Promise<string | null> {
  const logs: string[] = [];
  
  // Set up console listener
  page.on('console', msg => {
    if (msg.type() === 'log') {
      logs.push(msg.text());
    }
  });
  
  // Wait for verification code to be logged
  await page.waitForTimeout(1000);
  
  // Find the verification code in logs
  const codeLog = logs.find(log => log.includes('VERIFICATION CODE'));
  if (!codeLog) {
    console.error('Verification code not found in console logs:', logs);
    return null;
  }
  
  const match = codeLog.match(/\d{6}/);
  return match ? match[0] : null;
}

/**
 * Set up authenticated state for a user
 */
export async function authenticateUser(page: Page, user: TestUser): Promise<void> {
  await page.addInitScript((userData) => {
    const authData = {
      access_token: 'mock-token-' + userData.id,
      refresh_token: 'mock-refresh-' + userData.id,
      user: {
        id: userData.id,
        email: userData.email,
        user_metadata: {
          full_name: userData.fullName
        }
      }
    };
    
    // Set Supabase auth token
    window.localStorage.setItem('supabase.auth.token', JSON.stringify(authData));
    
    // Also set organization data if provided
    if (userData.organizationId) {
      window.localStorage.setItem('current_organization', JSON.stringify({
        id: userData.organizationId,
        role: userData.role || 'member'
      }));
    }
  }, user);
}

/**
 * Complete the signup flow and return the verification code
 */
export async function completeSignup(
  page: Page,
  email: string,
  password: string,
  fullName: string
): Promise<string | null> {
  // Navigate to signup
  await page.goto('/signup');
  
  // Fill form
  await page.fill('input[id="full-name"]', fullName);
  await page.fill('input[id="email"]', email);
  await page.fill('input[id="password"]', password);
  await page.check('input[id="agree-terms"]');
  
  // Submit
  await page.click('button:has-text("Create Account")');
  
  // Get verification code
  return await getVerificationCode(page);
}

/**
 * Complete email verification
 */
export async function verifyEmail(page: Page, code: string): Promise<void> {
  await page.fill('input[id="verification-code"]', code);
  await page.click('button:has-text("Verify Email")');
}

/**
 * Create an organization during onboarding
 */
export async function createOrganization(page: Page, name: string): Promise<void> {
  await page.fill('input[id="org-name"]', name);
  await page.click('button:has-text("Create Organization")');
}

/**
 * Sign out the current user
 */
export async function signOut(page: Page): Promise<void> {
  // Clear local storage
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  
  // Navigate to login to ensure clean state
  await page.goto('/login');
}

/**
 * Mock an invitation token
 */
export async function mockInvitation(page: Page, invitation: {
  token: string;
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  status?: string;
  customMessage?: string;
}): Promise<void> {
  await page.route(`/api/invitations/${invitation.token}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          token: invitation.token,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status || 'pending',
          customMessage: invitation.customMessage,
          organization: {
            id: 'test-org-id',
            name: invitation.organizationName
          },
          invitedBy: {
            full_name: invitation.inviterName,
            email: 'inviter@example.com'
          }
        }
      })
    });
  });
}

/**
 * Mock domain auto-join configuration
 */
export async function mockDomainAutoJoin(page: Page, domain: string, organizationName: string): Promise<void> {
  await page.route('/api/domains/check-auto-join', async route => {
    const request = route.request();
    const postData = request.postDataJSON();
    
    if (postData?.email?.endsWith(`@${domain}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          canAutoJoin: true,
          organizationId: 'auto-join-org-id',
          organizationName: organizationName,
          domain: domain
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          canAutoJoin: false
        })
      });
    }
  });
}

/**
 * Wait for navigation to complete
 */
export async function waitForNavigation(page: Page, url: string | RegExp): Promise<void> {
  await page.waitForURL(url, { timeout: 10000 });
}

/**
 * Check if an element contains text (case-insensitive)
 */
export async function elementContainsText(
  page: Page,
  selector: string,
  text: string
): Promise<boolean> {
  const element = await page.locator(selector).first();
  const content = await element.textContent();
  return content?.toLowerCase().includes(text.toLowerCase()) || false;
}