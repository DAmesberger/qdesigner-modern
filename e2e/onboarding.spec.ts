import { test, expect } from '@playwright/test';

// Helper to generate unique test emails
const generateTestEmail = () => `test+${Date.now()}@test.local`;

// Helper to extract verification code from console logs
async function getVerificationCode(page) {
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'log') {
      logs.push(msg.text());
    }
  });
  
  // Wait for verification code log
  await page.waitForTimeout(1000);
  
  const codeLog = logs.find(log => log.includes('VERIFICATION CODE'));
  if (!codeLog) {
    throw new Error('Verification code not found in console');
  }
  
  const match = codeLog.match(/\d{6}/);
  return match ? match[0] : null;
}

test.describe('Onboarding - Self-Service Flow', () => {
  test('should complete full self-service signup with organization creation', async ({ page }) => {
    const testEmail = generateTestEmail();
    
    // Start from signup page
    await page.goto('/signup');
    
    // Fill signup form
    await page.fill('input[id="full-name"]', 'Test User');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', 'TestPassword123!');
    
    // Check password strength indicator
    await expect(page.locator('.text-green-500')).toContainText('Strong');
    
    // Agree to terms
    await page.check('input[id="agree-terms"]');
    
    // Submit form
    await page.click('button:has-text("Create Account")');
    
    // Should show verification form
    await expect(page.locator('h2')).toContainText('Verify Your Email');
    await expect(page.locator('.text-muted-foreground')).toContainText(testEmail);
    
    // Test mode notice should appear
    await expect(page.locator('.font-semibold')).toContainText('Test Mode Active');
    
    // Get verification code from console
    const verificationCode = await getVerificationCode(page);
    expect(verificationCode).toBeTruthy();
    
    // Enter verification code
    await page.fill('input[id="verification-code"]', verificationCode);
    await page.click('button:has-text("Verify Email")');
    
    // Should redirect to organization onboarding
    await expect(page).toHaveURL('/onboarding/organization');
    
    // Create organization
    await page.fill('input[id="org-name"]', 'Test Research Lab');
    await page.click('button:has-text("Create Organization")');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });
  
  test('should show domain auto-join notification during signup', async ({ page }) => {
    // Navigate to signup
    await page.goto('/signup');
    
    // Enter university email
    await page.fill('input[id="email"]', 'student@university.edu');
    
    // Should show domain auto-join notification
    await expect(page.locator('.font-semibold')).toContainText("You'll automatically join");
    await expect(page.locator('.text-sm')).toContainText('@university.edu addresses');
  });
  
  test('should handle resend verification code', async ({ page }) => {
    const testEmail = generateTestEmail();
    
    // Complete signup to get to verification
    await page.goto('/signup');
    await page.fill('input[id="full-name"]', 'Test User');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', 'TestPassword123!');
    await page.check('input[id="agree-terms"]');
    await page.click('button:has-text("Create Account")');
    
    // Wait for initial timer
    await page.waitForTimeout(1000);
    
    // Should show resend timer
    await expect(page.locator('button:has-text("Resend code in")')).toBeVisible();
    
    // Wait for timer to complete (in test, we can't wait 60s)
    // In real tests, you might want to mock the timer
  });
});

test.describe('Onboarding - Invitation Flow', () => {
  test('should accept invitation when not logged in', async ({ page }) => {
    // Mock invitation token
    const invitationToken = 'test-invitation-token';
    
    // Navigate to invitation URL
    await page.goto(`/invite/${invitationToken}`);
    
    // Should show invitation details
    await expect(page.locator('h2')).toContainText("You're Invited!");
    
    // Should prompt to sign in or create account
    await expect(page.locator('.text-muted-foreground')).toContainText('Please sign in or create an account');
    
    // Click create account
    await page.click('button:has-text("Create Account")');
    
    // Should redirect to signup with email pre-filled
    await expect(page).toHaveURL(/\/signup\?email=/);
  });
  
  test('should show pending invitations on organization onboarding', async ({ page }) => {
    const testEmail = generateTestEmail();
    
    // Create account first
    await page.goto('/signup');
    await page.fill('input[id="full-name"]', 'Invited User');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', 'TestPassword123!');
    
    // Should show pending invitations notice
    await expect(page.locator('.font-semibold')).toContainText('pending invitation');
    
    await page.check('input[id="agree-terms"]');
    await page.click('button:has-text("Create Account")');
    
    // Verify email
    const verificationCode = await getVerificationCode(page);
    await page.fill('input[id="verification-code"]', verificationCode);
    await page.click('button:has-text("Verify Email")');
    
    // Should show invitations on organization page
    await expect(page).toHaveURL('/onboarding/organization');
    await expect(page.locator('h3')).toContainText('You have');
    await expect(page.locator('h3')).toContainText('pending invitation');
  });
  
  test('should decline invitation', async ({ page }) => {
    const invitationToken = 'test-invitation-token';
    
    // Mock authenticated user
    await page.goto(`/invite/${invitationToken}`);
    
    // Assume user is logged in (in real test, would need proper auth setup)
    // Click decline
    await page.click('button:has-text("Decline")');
    
    // Confirm dialog
    await page.on('dialog', dialog => dialog.accept());
    
    // Should show declined status
    await expect(page.locator('.text-muted-foreground')).toContainText('declined this invitation');
  });
});

test.describe('Onboarding - Admin Features', () => {
  // These tests assume admin authentication is set up
  test.skip('should send invitation from admin panel', async ({ page }) => {
    // Navigate to admin invitations
    await page.goto('/admin/invitations');
    
    // Click send invitation
    await page.click('button:has-text("Send Invitation")');
    
    // Fill invitation form
    await page.fill('input[id="invite-email"]', 'newuser@example.com');
    await page.selectOption('select[id="invite-role"]', 'member');
    await page.fill('textarea[id="invite-message"]', 'Welcome to our research team!');
    
    // Send invitation
    await page.click('button:has-text("Send Invitation")');
    
    // Should show success message
    await expect(page.locator('.text-green-800')).toContainText('Invitation sent');
  });
  
  test.skip('should configure domain auto-join', async ({ page }) => {
    // Navigate to admin domains
    await page.goto('/admin/domains');
    
    // Add new domain
    await page.click('button:has-text("Add Domain")');
    await page.fill('input[id="new-domain"]', 'research.edu');
    await page.click('button:has-text("Add Domain")');
    
    // Should show verification instructions
    await expect(page.locator('h4')).toContainText('Verification Instructions');
    
    // Verify domain (in real test, would need to set up verification)
    await page.click('button:has-text("Verify Domain")');
    
    // Configure settings
    await page.click('button:has-text("Settings")');
    await page.check('input[type="checkbox"]:has-text("Enable automatic joining")');
    await page.selectOption('select', 'member');
    await page.fill('textarea', 'Welcome to our research organization!');
    await page.click('button:has-text("Save Settings")');
    
    // Should show success
    await expect(page.locator('.text-green-800')).toContainText('Domain settings updated');
  });
});

test.describe('Onboarding - Error Handling', () => {
  test('should handle invalid verification code', async ({ page }) => {
    const testEmail = generateTestEmail();
    
    // Complete signup
    await page.goto('/signup');
    await page.fill('input[id="full-name"]', 'Test User');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', 'TestPassword123!');
    await page.check('input[id="agree-terms"]');
    await page.click('button:has-text("Create Account")');
    
    // Enter wrong code
    await page.fill('input[id="verification-code"]', '000000');
    await page.click('button:has-text("Verify Email")');
    
    // Should show error
    await expect(page.locator('.bg-red-50')).toBeVisible();
    await expect(page.locator('.text-red-800')).toContainText('Invalid verification code');
  });
  
  test('should handle duplicate email signup', async ({ page }) => {
    await page.goto('/signup');
    
    // Use a known existing email
    await page.fill('input[id="full-name"]', 'Duplicate User');
    await page.fill('input[id="email"]', 'existing@example.com');
    await page.fill('input[id="password"]', 'TestPassword123!');
    await page.check('input[id="agree-terms"]');
    await page.click('button:has-text("Create Account")');
    
    // Should show error
    await expect(page.locator('.bg-red-50')).toBeVisible();
    await expect(page.locator('.text-red-800')).toBeVisible();
  });
  
  test('should validate organization name', async ({ page }) => {
    // Navigate to organization onboarding (assuming authenticated)
    await page.goto('/onboarding/organization');
    
    // Try to submit empty name
    await page.click('button:has-text("Create Organization")');
    
    // Should show error
    await expect(page.locator('.text-red-800')).toContainText('Please enter an organization name');
  });
});

test.describe('Onboarding - Navigation', () => {
  test('should navigate between login and signup', async ({ page }) => {
    // Start at login
    await page.goto('/login');
    
    // Navigate to signup
    await page.click('a:has-text("Create an account")');
    await expect(page).toHaveURL('/signup');
    
    // Navigate back to login
    await page.click('a:has-text("Sign in")');
    await expect(page).toHaveURL('/login');
  });
  
  test('should handle back navigation during verification', async ({ page }) => {
    const testEmail = generateTestEmail();
    
    // Complete signup
    await page.goto('/signup');
    await page.fill('input[id="full-name"]', 'Test User');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', 'TestPassword123!');
    await page.check('input[id="agree-terms"]');
    await page.click('button:has-text("Create Account")');
    
    // Click back to signup
    await page.click('button:has-text("Back to sign up")');
    
    // Should show signup form again
    await expect(page.locator('h2')).toContainText('Create Your Account');
    
    // Email should still be filled
    await expect(page.locator('input[id="email"]')).toHaveValue(testEmail);
  });
  
  test('should redirect authenticated users from auth pages', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        user: { id: 'test-user-id', email: 'test@example.com' }
      }));
    });
    
    // Try to access login
    await page.goto('/login');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });
});

test.describe('Onboarding - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  
  test('should work on mobile devices', async ({ page }) => {
    await page.goto('/signup');
    
    // Check that form is visible and usable
    await expect(page.locator('input[id="full-name"]')).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="password"]')).toBeVisible();
    
    // Fill form on mobile
    await page.fill('input[id="full-name"]', 'Mobile User');
    await page.fill('input[id="email"]', generateTestEmail());
    await page.fill('input[id="password"]', 'TestPassword123!');
    
    // Scroll to checkbox and submit button
    await page.locator('input[id="agree-terms"]').scrollIntoViewIfNeeded();
    await page.check('input[id="agree-terms"]');
    
    await page.locator('button:has-text("Create Account")').scrollIntoViewIfNeeded();
    await page.click('button:has-text("Create Account")');
    
    // Should proceed to verification
    await expect(page.locator('h2')).toContainText('Verify Your Email');
  });
});