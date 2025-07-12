import { test, expect } from '@playwright/test';
import { createTestUser } from '../helpers/auth';

test.describe('Organization Onboarding Journey', () => {
  test('complete organization setup from signup to first study', async ({ page, context }) => {
    // Step 1: Organization Owner Signs Up
    await page.goto('/signup');
    
    const orgOwnerEmail = `owner-${Date.now()}@research-institute.edu`;
    const orgOwnerPassword = 'SecurePassword123!';
    
    // Fill signup form
    await page.fill('[data-testid="signup-email"]', orgOwnerEmail);
    await page.fill('[data-testid="signup-password"]', orgOwnerPassword);
    await page.fill('[data-testid="signup-name"]', 'Dr. Patricia Kumar');
    await page.fill('[data-testid="organization-name"]', 'Advanced Research Institute');
    await page.selectOption('[data-testid="organization-type"]', 'research_institute');
    
    // Accept terms
    await page.check('[data-testid="accept-terms"]');
    await page.click('[data-testid="create-organization"]');
    
    // Verify email (in test mode, auto-confirmed)
    await page.waitForURL('/onboarding/welcome');
    
    // Step 2: Configure Organization
    await expect(page.locator('h1')).toContainText('Welcome to QDesigner Modern');
    
    // Set up organization details
    await page.fill('[data-testid="org-website"]', 'https://research-institute.edu');
    await page.fill('[data-testid="org-description"]', 'Leading research in cognitive psychology');
    
    // Configure branding
    await page.click('[data-testid="upload-logo"]');
    await page.setInputFiles('[data-testid="logo-input"]', 'tests/fixtures/test-logo.png');
    
    await page.fill('[data-testid="primary-color"]', '#1E40AF');
    await page.fill('[data-testid="secondary-color"]', '#3B82F6');
    
    await page.click('[data-testid="continue-setup"]');
    
    // Step 3: Set up SSO (optional for now)
    await page.waitForSelector('[data-testid="sso-setup"]');
    await page.click('[data-testid="skip-sso"]'); // Skip for initial setup
    
    // Step 4: Invite Team Members
    await page.waitForURL('/onboarding/team');
    
    // Add department administrator
    await page.click('[data-testid="add-team-member"]');
    await page.fill('[data-testid="invite-email-0"]', 'james.wilson@research-institute.edu');
    await page.fill('[data-testid="invite-name-0"]', 'Prof. James Wilson');
    await page.selectOption('[data-testid="invite-role-0"]', 'admin');
    await page.selectOption('[data-testid="invite-department-0"]', 'psychology');
    
    // Add principal investigator
    await page.click('[data-testid="add-team-member"]');
    await page.fill('[data-testid="invite-email-1"]', 'lisa.chang@research-institute.edu');
    await page.fill('[data-testid="invite-name-1"]', 'Dr. Lisa Chang');
    await page.selectOption('[data-testid="invite-role-1"]', 'editor');
    
    // Add research designer
    await page.click('[data-testid="add-team-member"]');
    await page.fill('[data-testid="invite-email-2"]', 'alex.thompson@research-institute.edu');
    await page.fill('[data-testid="invite-name-2"]', 'Alex Thompson');
    await page.selectOption('[data-testid="invite-role-2"]', 'editor');
    
    await page.click('[data-testid="send-invitations"]');
    
    // Verify invitations sent
    await expect(page.locator('[data-testid="toast"]')).toContainText('3 invitations sent');
    
    // Step 5: Create First Project
    await page.click('[data-testid="continue-to-projects"]');
    await page.waitForURL('/onboarding/first-project');
    
    await page.fill('[data-testid="project-name"]', 'Cognitive Load Studies 2024');
    await page.fill('[data-testid="project-description"]', 'Investigating working memory capacity under various conditions');
    await page.selectOption('[data-testid="project-category"]', 'psychology');
    
    // Set project permissions
    await page.check('[data-testid="allow-external-participants"]');
    await page.check('[data-testid="require-consent"]');
    
    await page.click('[data-testid="create-project"]');
    
    // Step 6: Interactive Tutorial
    await page.waitForURL('/onboarding/tutorial');
    await expect(page.locator('[data-testid="tutorial-welcome"]')).toBeVisible();
    
    // Complete mini tutorial
    await page.click('[data-testid="start-tutorial"]');
    
    // Tutorial: Create simple questionnaire
    await page.waitForSelector('[data-testid="tutorial-designer"]');
    await page.dragAndDrop('[data-testid="question-type-text"]', '[data-testid="canvas-drop-zone"]');
    await page.fill('[data-testid="question-text"]', 'What is your age?');
    
    await page.dragAndDrop('[data-testid="question-type-single-choice"]', '[data-testid="canvas-drop-zone"]');
    await page.fill('[data-testid="question-text"]', 'What is your primary research area?');
    
    // Add options
    await page.fill('[data-testid="option-0"]', 'Cognitive Psychology');
    await page.fill('[data-testid="option-1"]', 'Social Psychology');
    await page.click('[data-testid="add-option"]');
    await page.fill('[data-testid="option-2"]', 'Clinical Psychology');
    
    await page.click('[data-testid="complete-tutorial"]');
    
    // Verify tutorial completion
    await expect(page.locator('[data-testid="tutorial-complete"]')).toContainText('Great job!');
    
    // Step 7: Navigate to Dashboard
    await page.click('[data-testid="go-to-dashboard"]');
    await page.waitForURL('/dashboard');
    
    // Verify organization dashboard
    await expect(page.locator('[data-testid="org-name"]')).toContainText('Advanced Research Institute');
    await expect(page.locator('[data-testid="team-count"]')).toContainText('4 members'); // Owner + 3 invited
    await expect(page.locator('[data-testid="project-count"]')).toContainText('1 project');
    
    // Verify subscription tier
    await expect(page.locator('[data-testid="subscription-tier"]')).toContainText('Professional Trial');
    await expect(page.locator('[data-testid="trial-days-left"]')).toContainText('30 days left');
    
    // Step 8: Verify Team Member Can Access
    // Simulate team member accepting invitation and logging in
    const page2 = await context.newPage();
    
    // Mock invitation acceptance (in real scenario, would click email link)
    await page2.goto('/invite/accept?token=mock-invite-token-1');
    
    // Team member sets password
    await page2.fill('[data-testid="set-password"]', 'TeamMemberPass123!');
    await page2.fill('[data-testid="confirm-password"]', 'TeamMemberPass123!');
    await page2.click('[data-testid="accept-invitation"]');
    
    // Team member lands on their dashboard
    await page2.waitForURL('/dashboard');
    await expect(page2.locator('[data-testid="welcome-message"]')).toContainText('Welcome, Prof. James Wilson');
    await expect(page2.locator('[data-testid="org-name"]')).toContainText('Advanced Research Institute');
    await expect(page2.locator('[data-testid="user-role"]')).toContainText('Department Administrator');
    
    // Verify they can see the project
    await page2.click('[data-testid="projects-tab"]');
    await expect(page2.locator('[data-testid="project-card"]')).toContainText('Cognitive Load Studies 2024');
    
    // Clean up
    await page2.close();
  });
  
  test('organization owner can manage subscription and billing', async ({ page }) => {
    // Create and login as org owner
    const owner = await createTestUser({
      email: `billing-test-${Date.now()}@example.com`,
      role: 'owner'
    });
    
    await page.goto('/login');
    await page.fill('[data-testid="email"]', owner.email);
    await page.fill('[data-testid="password"]', owner.password);
    await page.click('[data-testid="login-button"]');
    
    // Navigate to billing
    await page.goto('/settings/billing');
    
    // View current plan
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Professional Trial');
    await expect(page.locator('[data-testid="usage-responses"]')).toContainText('0 / 10,000');
    await expect(page.locator('[data-testid="usage-storage"]')).toContainText('0 GB / 50 GB');
    
    // Upgrade to Team plan
    await page.click('[data-testid="upgrade-plan"]');
    await page.waitForSelector('[data-testid="plan-selector"]');
    
    await page.click('[data-testid="select-team-plan"]');
    await expect(page.locator('[data-testid="plan-summary"]')).toContainText('$499/month');
    await expect(page.locator('[data-testid="plan-features"]')).toContainText('Unlimited projects');
    
    // Add payment method
    await page.click('[data-testid="add-payment-method"]');
    
    // Fill Stripe elements (mocked in test environment)
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"]', '12/25');
    await page.fill('[data-testid="card-cvc"]', '123');
    await page.fill('[data-testid="card-zip"]', '10001');
    
    await page.click('[data-testid="confirm-upgrade"]');
    
    // Verify upgrade success
    await page.waitForSelector('[data-testid="upgrade-success"]');
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Team');
    await expect(page.locator('[data-testid="next-billing"]')).toContainText('$499');
    
    // Set up usage alerts
    await page.click('[data-testid="usage-alerts-tab"]');
    await page.fill('[data-testid="response-alert-threshold"]', '90');
    await page.fill('[data-testid="storage-alert-threshold"]', '80');
    await page.fill('[data-testid="alert-email"]', 'billing@research-institute.edu');
    await page.click('[data-testid="save-alerts"]');
    
    await expect(page.locator('[data-testid="toast"]')).toContainText('Usage alerts configured');
  });
  
  test('multi-tenant isolation between organizations', async ({ page, context }) => {
    // Create two separate organizations
    const org1Owner = await createTestUser({
      email: `org1-${Date.now()}@example.com`,
      role: 'owner'
    });
    
    const org2Owner = await createTestUser({
      email: `org2-${Date.now()}@example.com`,
      role: 'owner'
    });
    
    // Set up Organization 1
    await page.goto('/login');
    await page.fill('[data-testid="email"]', org1Owner.email);
    await page.fill('[data-testid="password"]', org1Owner.password);
    await page.click('[data-testid="login-button"]');
    
    // Create project in Org 1
    await page.goto('/projects/new');
    await page.fill('[data-testid="project-name"]', 'Org 1 Confidential Project');
    await page.fill('[data-testid="project-description"]', 'Sensitive research data');
    await page.click('[data-testid="create-project"]');
    
    // Get project URL
    const org1ProjectUrl = page.url();
    
    // Create questionnaire in Org 1
    await page.click('[data-testid="create-questionnaire"]');
    await page.fill('[data-testid="questionnaire-name"]', 'Org 1 Private Survey');
    await page.click('[data-testid="save-questionnaire"]');
    
    // Logout
    await page.goto('/logout');
    
    // Login as Organization 2 owner
    await page.goto('/login');
    await page.fill('[data-testid="email"]', org2Owner.email);
    await page.fill('[data-testid="password"]', org2Owner.password);
    await page.click('[data-testid="login-button"]');
    
    // Try to access Org 1's project directly
    await page.goto(org1ProjectUrl);
    
    // Should be denied access
    await expect(page.locator('[data-testid="error-403"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Access denied');
    
    // Verify Org 2 can only see their own data
    await page.goto('/projects');
    await expect(page.locator('[data-testid="project-list"]')).not.toContainText('Org 1 Confidential Project');
    
    // Create Org 2's own project
    await page.click('[data-testid="create-project"]');
    await page.fill('[data-testid="project-name"]', 'Org 2 Research Project');
    await page.click('[data-testid="create-project"]');
    
    // Verify isolation in search
    await page.goto('/search');
    await page.fill('[data-testid="global-search"]', 'Confidential');
    await page.click('[data-testid="search-button"]');
    
    // Should not find Org 1's content
    await expect(page.locator('[data-testid="search-results"]')).not.toContainText('Org 1');
    await expect(page.locator('[data-testid="no-results"]')).toBeVisible();
  });
});