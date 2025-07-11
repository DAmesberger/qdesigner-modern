import { test, expect } from '@playwright/test';

// Helper to set up authenticated state
async function authenticateUser(page, userId: string, email: string) {
  await page.addInitScript((data) => {
    window.localStorage.setItem('supabase.auth.token', JSON.stringify({
      access_token: 'mock-token',
      refresh_token: 'mock-refresh',
      user: { id: data.userId, email: data.email }
    }));
  }, { userId, email });
}

test.describe('Onboarding - Domain Auto-Join Advanced', () => {
  test('should auto-join organization after email verification', async ({ page }) => {
    // Simulate a domain that has auto-join enabled
    const testEmail = `newuser+${Date.now()}@approved-domain.com`;
    
    await page.goto('/signup');
    
    // Enter email from approved domain
    await page.fill('input[id="email"]', testEmail);
    
    // Should show auto-join notification
    await expect(page.locator('.font-semibold')).toContainText("You'll automatically join");
    
    // Complete signup
    await page.fill('input[id="full-name"]', 'Domain User');
    await page.fill('input[id="password"]', 'TestPassword123!');
    await page.check('input[id="agree-terms"]');
    await page.click('button:has-text("Create Account")');
    
    // Get and enter verification code
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.waitForTimeout(1000);
    const codeLog = logs.find(log => log.includes('VERIFICATION CODE'));
    const verificationCode = codeLog?.match(/\d{6}/)?.[0];
    
    await page.fill('input[id="verification-code"]', verificationCode || '123456');
    await page.click('button:has-text("Verify Email")');
    
    // Should skip organization creation and go straight to dashboard
    await expect(page).toHaveURL('/dashboard');
  });
  
  test('should handle subdomain auto-join', async ({ page }) => {
    const testEmail = `user+${Date.now()}@sub.approved-domain.com`;
    
    await page.goto('/signup');
    await page.fill('input[id="email"]', testEmail);
    
    // Should show auto-join for parent domain if subdomains are included
    await expect(page.locator('.text-sm')).toContainText('@approved-domain.com');
  });
});

test.describe('Onboarding - Multiple Invitations', () => {
  test('should handle user with multiple pending invitations', async ({ page }) => {
    const testEmail = `multi-invite+${Date.now()}@test.local`;
    
    // Complete signup
    await page.goto('/signup');
    await page.fill('input[id="full-name"]', 'Multi Org User');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', 'TestPassword123!');
    
    // Should show multiple invitations notice
    await expect(page.locator('.font-semibold')).toContainText('pending invitations');
    
    await page.check('input[id="agree-terms"]');
    await page.click('button:has-text("Create Account")');
    
    // Verify email
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.waitForTimeout(1000);
    const codeLog = logs.find(log => log.includes('VERIFICATION CODE'));
    const verificationCode = codeLog?.match(/\d{6}/)?.[0];
    
    await page.fill('input[id="verification-code"]', verificationCode || '123456');
    await page.click('button:has-text("Verify Email")');
    
    // Should show all invitations on organization page
    await expect(page).toHaveURL('/onboarding/organization');
    
    // Should be able to accept one invitation
    await page.click('button:has-text("Accept & Join")');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });
  
  test('should switch between invitations and create organization', async ({ page }) => {
    const testEmail = `choice+${Date.now()}@test.local`;
    
    // Navigate directly to organization onboarding (assuming auth)
    await authenticateUser(page, 'test-user-id', testEmail);
    await page.goto('/onboarding/organization');
    
    // Should show invitations by default if any exist
    // Click to create new organization instead
    await page.click('button:has-text("Create New Organization Instead")');
    
    // Should show create form
    await expect(page.locator('input[id="org-name"]')).toBeVisible();
    
    // Go back to invitations
    await page.click('button:has-text("Back to invitations")');
    
    // Should show invitations again
    await expect(page.locator('h3')).toContainText('pending invitation');
  });
});

test.describe('Onboarding - Invitation Edge Cases', () => {
  test('should handle expired invitation', async ({ page }) => {
    const expiredToken = 'expired-invitation-token';
    
    await page.goto(`/invite/${expiredToken}`);
    
    // Should show error
    await expect(page.locator('h3')).toContainText('Invalid Invitation');
    await expect(page.locator('.text-muted-foreground')).toContainText('expired');
    
    // Should offer to go home
    await page.click('button:has-text("Go to Home")');
    await expect(page).toHaveURL('/');
  });
  
  test('should handle wrong email account for invitation', async ({ page }) => {
    const invitationToken = 'specific-email-token';
    
    // Authenticate with different email
    await authenticateUser(page, 'wrong-user-id', 'wrong@example.com');
    await page.goto(`/invite/${invitationToken}`);
    
    // Should show warning
    await expect(page.locator('.bg-orange-50')).toBeVisible();
    await expect(page.locator('.text-orange-800')).toContainText('signed in as wrong@example.com');
    
    // Should offer to switch account
    await page.click('button:has-text("Switch Account")');
    
    // Should sign out and redirect to login
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
  
  test('should handle invitation for existing member', async ({ page }) => {
    const duplicateToken = 'duplicate-member-token';
    
    await authenticateUser(page, 'existing-member-id', 'member@org.com');
    await page.goto(`/invite/${duplicateToken}`);
    
    // Should show appropriate error
    await expect(page.locator('.text-muted-foreground')).toContainText('already a member');
  });
});

test.describe('Onboarding - Security Tests', () => {
  test('should validate email format strictly', async ({ page }) => {
    await page.goto('/signup');
    
    // Try invalid email formats
    const invalidEmails = [
      'notanemail',
      '@example.com',
      'user@',
      'user@.com',
      'user@domain',
      'user name@example.com',
      'user@domain..com'
    ];
    
    for (const email of invalidEmails) {
      await page.fill('input[id="email"]', email);
      await page.fill('input[id="password"]', 'TestPassword123!');
      
      // Should show browser's built-in validation
      const isValid = await page.evaluate(() => {
        const input = document.querySelector('input[id="email"]') as HTMLInputElement;
        return input.checkValidity();
      });
      
      expect(isValid).toBe(false);
    }
  });
  
  test('should enforce password requirements', async ({ page }) => {
    await page.goto('/signup');
    
    const weakPasswords = [
      { pwd: 'short', strength: 'Weak' },
      { pwd: 'alllowercase', strength: 'Fair' },
      { pwd: 'ALLUPPERCASE', strength: 'Fair' },
      { pwd: '12345678', strength: 'Weak' },
      { pwd: 'NoNumbers!', strength: 'Good' }
    ];
    
    for (const { pwd, strength } of weakPasswords) {
      await page.fill('input[id="password"]', pwd);
      
      // Check strength indicator
      const strengthText = await page.locator('.text-sm').last().textContent();
      expect(strengthText).toContain(strength);
    }
    
    // Test strong password
    await page.fill('input[id="password"]', 'Str0ng!P@ssw0rd123');
    const strongText = await page.locator('.text-green-500').textContent();
    expect(strongText).toContain('Strong');
  });
  
  test('should prevent XSS in invitation messages', async ({ page }) => {
    const xssToken = 'xss-test-token';
    
    await page.goto(`/invite/${xssToken}`);
    
    // If invitation has XSS in custom message, it should be escaped
    // Check that no scripts execute
    const alerts = [];
    page.on('dialog', dialog => alerts.push(dialog.message()));
    
    await page.waitForTimeout(2000);
    expect(alerts).toHaveLength(0);
  });
});

test.describe('Onboarding - Performance Tests', () => {
  test('should handle rapid form submissions gracefully', async ({ page }) => {
    await page.goto('/signup');
    
    // Fill form
    await page.fill('input[id="full-name"]', 'Rapid User');
    await page.fill('input[id="email"]', `rapid+${Date.now()}@test.local`);
    await page.fill('input[id="password"]', 'TestPassword123!');
    await page.check('input[id="agree-terms"]');
    
    // Click submit multiple times rapidly
    const submitButton = page.locator('button:has-text("Create Account")');
    await Promise.all([
      submitButton.click(),
      submitButton.click(),
      submitButton.click()
    ]);
    
    // Should only process once and show verification
    await expect(page.locator('h2')).toContainText('Verify Your Email');
    
    // Should not show multiple errors
    const errors = await page.locator('.bg-red-50').count();
    expect(errors).toBeLessThanOrEqual(1);
  });
  
  test('should load invitation page quickly', async ({ page }) => {
    const start = Date.now();
    await page.goto('/invite/test-token');
    
    // Wait for content to load
    await expect(page.locator('h2')).toBeVisible();
    
    const loadTime = Date.now() - start;
    // Page should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });
});

test.describe('Onboarding - Accessibility', () => {
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/signup');
    
    // Tab through form fields
    await page.keyboard.press('Tab'); // Focus full name
    await page.keyboard.type('Keyboard User');
    
    await page.keyboard.press('Tab'); // Focus email
    await page.keyboard.type(`keyboard+${Date.now()}@test.local`);
    
    await page.keyboard.press('Tab'); // Focus password
    await page.keyboard.type('TestPassword123!');
    
    await page.keyboard.press('Tab'); // Focus terms checkbox
    await page.keyboard.press('Space'); // Check it
    
    await page.keyboard.press('Tab'); // Focus submit button
    await page.keyboard.press('Enter'); // Submit
    
    // Should proceed to verification
    await expect(page.locator('h2')).toContainText('Verify Your Email');
  });
  
  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/signup');
    
    // Check form has proper labels
    const emailLabel = await page.locator('label[for="email"]').textContent();
    expect(emailLabel).toContain('Email Address');
    
    const passwordLabel = await page.locator('label[for="password"]').textContent();
    expect(passwordLabel).toContain('Password');
    
    // Check buttons have accessible text
    const submitButton = await page.locator('button:has-text("Create Account")');
    const buttonText = await submitButton.textContent();
    expect(buttonText).toBeTruthy();
  });
});

test.describe('Onboarding - Browser Compatibility', () => {
  // Test with different user agents
  const browsers = [
    { name: 'Safari', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15' },
    { name: 'Firefox', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0' },
    { name: 'Edge', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36 Edg/93.0.961.38' }
  ];
  
  for (const browser of browsers) {
    test(`should work in ${browser.name}`, async ({ page }) => {
      await page.setUserAgent(browser.userAgent);
      await page.goto('/signup');
      
      // Basic functionality should work
      await expect(page.locator('input[id="email"]')).toBeVisible();
      await page.fill('input[id="email"]', `${browser.name.toLowerCase()}+${Date.now()}@test.local`);
      
      // Password field should work
      await page.fill('input[id="password"]', 'TestPassword123!');
      
      // Form should be submittable
      const submitButton = await page.locator('button:has-text("Create Account")');
      expect(await submitButton.isEnabled()).toBe(true);
    });
  }
});