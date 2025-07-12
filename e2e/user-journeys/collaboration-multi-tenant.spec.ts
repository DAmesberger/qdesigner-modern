import { test, expect } from '@playwright/test';
import { createTestUser, setupTestOrganization } from '../helpers/auth';

test.describe('Collaboration and Multi-Tenant Scenarios', () => {
  test('real-time collaboration between team members', async ({ browser }) => {
    // Set up organization and users
    const setup = await setupTestOrganization();
    const organization = setup.organization;
    const project = setup.project;
    
    // Create multiple team members
    const pi = await createTestUser({
      email: `pi-${Date.now()}@example.com`,
      role: 'admin',
      organizationId: organization.id,
      name: 'Dr. Sarah Johnson'
    });
    
    const designer = await createTestUser({
      email: `designer-${Date.now()}@example.com`,
      role: 'editor',
      organizationId: organization.id,
      name: 'Mike Chen'
    });
    
    const assistant = await createTestUser({
      email: `assistant-${Date.now()}@example.com`,
      role: 'editor',
      organizationId: organization.id,
      name: 'Emma Davis'
    });
    
    // Create three browser contexts for real-time collaboration
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const context3 = await browser.newContext();
    
    const piPage = await context1.newPage();
    const designerPage = await context2.newPage();
    const assistantPage = await context3.newPage();
    
    // All users login and navigate to same questionnaire
    const questionnaireId = 'collab-test-' + Date.now();
    
    // PI creates questionnaire
    await piPage.goto('/login');
    await piPage.fill('[data-testid="email"]', pi.email);
    await piPage.fill('[data-testid="password"]', pi.password);
    await piPage.click('[data-testid="login-button"]');
    
    await piPage.goto(`/projects/${project.id}/questionnaires/new`);
    await piPage.fill('[data-testid="questionnaire-name"]', 'Collaborative Study Design');
    await piPage.click('[data-testid="enable-collaboration"]');
    await piPage.click('[data-testid="create-questionnaire"]');
    
    const questionnaireUrl = piPage.url();
    
    // Designer joins
    await designerPage.goto('/login');
    await designerPage.fill('[data-testid="email"]', designer.email);
    await designerPage.fill('[data-testid="password"]', designer.password);
    await designerPage.click('[data-testid="login-button"]');
    await designerPage.goto(questionnaireUrl);
    
    // Assistant joins
    await assistantPage.goto('/login');
    await assistantPage.fill('[data-testid="email"]', assistant.email);
    await assistantPage.fill('[data-testid="password"]', assistant.password);
    await assistantPage.click('[data-testid="login-button"]');
    await assistantPage.goto(questionnaireUrl);
    
    // Verify presence indicators
    await piPage.waitForSelector('[data-testid="collaborator-avatar-Mike"]');
    await piPage.waitForSelector('[data-testid="collaborator-avatar-Emma"]');
    
    await expect(piPage.locator('[data-testid="active-collaborators"]')).toContainText('3 active');
    
    // Real-time editing
    // PI adds a page
    await piPage.click('[data-testid="add-page"]');
    await piPage.fill('[data-testid="page-title"]', 'Demographics');
    
    // Others should see it immediately
    await designerPage.waitForSelector('[data-testid="page-Demographics"]');
    await assistantPage.waitForSelector('[data-testid="page-Demographics"]');
    
    // Designer adds question while PI watches
    await designerPage.click('[data-testid="page-Demographics"]');
    await designerPage.click('[data-testid="add-question"]');
    
    // PI should see live cursor/selection
    await expect(piPage.locator('[data-testid="remote-cursor-Mike"]')).toBeVisible();
    
    await designerPage.selectOption('[data-testid="question-type"]', 'text');
    await designerPage.fill('[data-testid="question-text"]', 'What is your age?');
    
    // Verify question appears for all
    await piPage.waitForSelector('[data-testid="question-What is your age?"]');
    await assistantPage.waitForSelector('[data-testid="question-What is your age?"]');
    
    // Assistant adds validation while others watch
    await assistantPage.click('[data-testid="question-What is your age?"]');
    await assistantPage.click('[data-testid="add-validation"]');
    await assistantPage.selectOption('[data-testid="validation-type"]', 'number-range');
    await assistantPage.fill('[data-testid="min-value"]', '18');
    await assistantPage.fill('[data-testid="max-value"]', '100');
    
    // Show who made changes
    await expect(piPage.locator('[data-testid="change-indicator"]')).toContainText('Emma added validation');
    
    // Conflict resolution
    // Both PI and Designer try to edit same question
    await piPage.click('[data-testid="question-What is your age?"]');
    await designerPage.click('[data-testid="question-What is your age?"]');
    
    // Designer starts typing
    await designerPage.fill('[data-testid="question-text"]', 'Please enter your age:');
    
    // PI tries to type at same time
    await piPage.fill('[data-testid="question-text"]', 'Your current age:');
    
    // System should handle gracefully - last write wins or collaborative editing
    await expect(designerPage.locator('[data-testid="question-text"]')).toHaveValue('Your current age:');
    
    // Comments and discussions
    await piPage.click('[data-testid="add-comment"]');
    await piPage.fill('[data-testid="comment-text"]', '@Mike Should we add age ranges instead of exact age?');
    await piPage.click('[data-testid="post-comment"]');
    
    // Designer receives notification
    await expect(designerPage.locator('[data-testid="notification-badge"]')).toContainText('1');
    await designerPage.click('[data-testid="notifications"]');
    await expect(designerPage.locator('[data-testid="notification-message"]')).toContainText('mentioned you');
    
    // Designer responds
    await designerPage.click('[data-testid="reply-to-comment"]');
    await designerPage.fill('[data-testid="reply-text"]', 'Good idea! Let me update it to age ranges.');
    await designerPage.click('[data-testid="send-reply"]');
    
    // Version checkpoint
    await piPage.click('[data-testid="create-checkpoint"]');
    await piPage.fill('[data-testid="checkpoint-name"]', 'Initial demographics section');
    await piPage.click('[data-testid="save-checkpoint"]');
    
    // Activity log shows all actions
    await piPage.click('[data-testid="activity-log"]');
    await expect(piPage.locator('[data-testid="activity-item"]').first()).toContainText('Sarah created checkpoint');
    await expect(piPage.locator('[data-testid="activity-item"]').nth(1)).toContainText('Mike replied to comment');
    await expect(piPage.locator('[data-testid="activity-item"]').nth(2)).toContainText('Sarah added comment');
    
    // Clean up
    await context1.close();
    await context2.close();
    await context3.close();
  });
  
  test('cross-organization project sharing and permissions', async ({ page, context }) => {
    // Create two organizations
    const org1Setup = await setupTestOrganization('Research Institute A');
    const org2Setup = await setupTestOrganization('Research Institute B');
    
    const org1Admin = await createTestUser({
      email: `admin1-${Date.now()}@org1.edu`,
      role: 'admin',
      organizationId: org1Setup.organization.id
    });
    
    const org2Researcher = await createTestUser({
      email: `researcher2-${Date.now()}@org2.edu`,
      role: 'editor',
      organizationId: org2Setup.organization.id
    });
    
    // Org1 admin creates shareable project
    await page.goto('/login');
    await page.fill('[data-testid="email"]', org1Admin.email);
    await page.fill('[data-testid="password"]', org1Admin.password);
    await page.click('[data-testid="login-button"]');
    
    await page.goto('/projects/new');
    await page.fill('[data-testid="project-name"]', 'Multi-Institution Collaboration Study');
    await page.fill('[data-testid="project-description"]', 'Joint research project between Institute A and B');
    await page.check('[data-testid="enable-external-collaboration"]');
    await page.click('[data-testid="create-project"]');
    
    const projectUrl = page.url();
    const projectId = projectUrl.split('/').pop();
    
    // Configure external access
    await page.click('[data-testid="project-settings"]');
    await page.click('[data-testid="external-access-tab"]');
    
    // Create collaboration invite
    await page.click('[data-testid="create-collaboration-link"]');
    await page.selectOption('[data-testid="access-level"]', 'contributor');
    await page.selectOption('[data-testid="expires"]', '30-days');
    await page.check('[data-testid="require-approval"]');
    await page.click('[data-testid="generate-link"]');
    
    const inviteLink = await page.locator('[data-testid="collaboration-link"]').textContent();
    
    // Org2 researcher requests access
    const page2 = await context.newPage();
    await page2.goto('/login');
    await page2.fill('[data-testid="email"]', org2Researcher.email);
    await page2.fill('[data-testid="password"]', org2Researcher.password);
    await page2.click('[data-testid="login-button"]');
    
    await page2.goto(inviteLink!);
    
    // Access request form
    await expect(page2.locator('[data-testid="collaboration-request"]')).toBeVisible();
    await expect(page2.locator('[data-testid="project-info"]')).toContainText('Multi-Institution Collaboration Study');
    await expect(page2.locator('[data-testid="host-org"]')).toContainText('Research Institute A');
    
    await page2.fill('[data-testid="request-reason"]', 'Contributing neuroimaging data analysis expertise');
    await page2.selectOption('[data-testid="data-usage"]', 'analysis-only');
    await page2.check('[data-testid="agree-terms"]');
    await page2.click('[data-testid="submit-request"]');
    
    // Org1 admin receives request
    await page.reload();
    await expect(page.locator('[data-testid="pending-requests-badge"]')).toContainText('1');
    
    await page.click('[data-testid="pending-requests"]');
    await expect(page.locator('[data-testid="requester-org"]')).toContainText('Research Institute B');
    await expect(page.locator('[data-testid="requester-email"]')).toContainText(org2Researcher.email);
    
    // Review and approve
    await page.click('[data-testid="review-request"]');
    await page.check('[data-testid="grant-read-access"]');
    await page.check('[data-testid="grant-comment-access"]');
    await page.uncheck('[data-testid="grant-edit-access"]'); // Limited access
    await page.click('[data-testid="approve-request"]');
    
    // Org2 researcher can now access
    await page2.reload();
    await page2.goto(`/projects/${projectId}`);
    
    // Verify limited permissions
    await expect(page2.locator('[data-testid="external-user-badge"]')).toBeVisible();
    await expect(page2.locator('[data-testid="permission-level"]')).toContainText('Contributor (Read-only)');
    
    // Can view data
    await page2.click('[data-testid="view-questionnaires"]');
    await expect(page2.locator('[data-testid="questionnaire-list"]')).toBeVisible();
    
    // Cannot edit
    await page2.click('[data-testid="questionnaire-1"]');
    await expect(page2.locator('[data-testid="edit-button"]')).toBeDisabled();
    
    // Can comment
    await page2.click('[data-testid="add-comment"]');
    await page2.fill('[data-testid="comment-text"]', 'Consider adding fMRI timing markers here');
    await page2.click('[data-testid="post-comment"]');
    
    // Comment visible to org1
    await page.reload();
    await expect(page.locator('[data-testid="external-comment"]')).toBeVisible();
    await expect(page.locator('[data-testid="comment-author-org"]')).toContainText('Research Institute B');
    
    // Data access audit trail
    await page.click('[data-testid="project-settings"]');
    await page.click('[data-testid="audit-log-tab"]');
    
    await expect(page.locator('[data-testid="audit-entry"]').first()).toContainText('External user added comment');
    await expect(page.locator('[data-testid="audit-entry"]').nth(1)).toContainText('Approved external access');
    await expect(page.locator('[data-testid="audit-entry"]').nth(2)).toContainText('External access requested');
    
    await page2.close();
  });
  
  test('department-level resource management and quotas', async ({ page }) => {
    // Set up organization with departments
    const orgSetup = await setupTestOrganization();
    
    const deptAdmin = await createTestUser({
      email: `dept-admin-${Date.now()}@example.com`,
      role: 'admin',
      organizationId: orgSetup.organization.id,
      department: 'Psychology'
    });
    
    const researcher1 = await createTestUser({
      email: `researcher1-${Date.now()}@example.com`,
      role: 'editor',
      organizationId: orgSetup.organization.id,
      department: 'Psychology'
    });
    
    const researcher2 = await createTestUser({
      email: `researcher2-${Date.now()}@example.com`,
      role: 'editor',
      organizationId: orgSetup.organization.id,
      department: 'Neuroscience'
    });
    
    // Department admin login
    await page.goto('/login');
    await page.fill('[data-testid="email"]', deptAdmin.email);
    await page.fill('[data-testid="password"]', deptAdmin.password);
    await page.click('[data-testid="login-button"]');
    
    // Navigate to department dashboard
    await page.goto('/department/psychology');
    
    // View department resources
    await expect(page.locator('[data-testid="dept-name"]')).toContainText('Psychology Department');
    await expect(page.locator('[data-testid="dept-members"]')).toContainText('2 members');
    await expect(page.locator('[data-testid="dept-projects"]')).toContainText('0 active projects');
    
    // Check quotas
    await expect(page.locator('[data-testid="response-quota"]')).toContainText('0 / 50,000 used');
    await expect(page.locator('[data-testid="storage-quota"]')).toContainText('0 GB / 100 GB used');
    await expect(page.locator('[data-testid="concurrent-studies"]')).toContainText('0 / 10 active');
    
    // Create department project with budget
    await page.click('[data-testid="create-dept-project"]');
    await page.fill('[data-testid="project-name"]', 'Psychology Annual Survey 2024');
    await page.fill('[data-testid="expected-responses"]', '5000');
    await page.fill('[data-testid="project-budget"]', '2500');
    await page.selectOption('[data-testid="budget-allocation"]', 'participant-compensation');
    await page.click('[data-testid="create-project"]');
    
    // Assign team members
    await page.click('[data-testid="manage-team"]');
    await page.check(`[data-testid="assign-${researcher1.email}"]`);
    await page.selectOption(`[data-testid="role-${researcher1.email}"]`, 'lead-researcher');
    
    // Try to assign from different department - should fail
    await page.fill('[data-testid="add-external-member"]', researcher2.email);
    await page.click('[data-testid="add-member"]');
    await expect(page.locator('[data-testid="error-message"]')).toContainText('User belongs to different department');
    
    // Set project limits
    await page.click('[data-testid="project-limits"]');
    await page.fill('[data-testid="max-responses"]', '5000');
    await page.fill('[data-testid="daily-response-limit"]', '200');
    await page.check('[data-testid="enforce-limits"]');
    await page.click('[data-testid="save-limits"]');
    
    // Monitor usage across department
    await page.click('[data-testid="dept-analytics"]');
    
    // View by project
    await page.click('[data-testid="usage-by-project"]');
    await expect(page.locator('[data-testid="project-chart"]')).toBeVisible();
    
    // View by user
    await page.click('[data-testid="usage-by-user"]');
    await expect(page.locator('[data-testid="user-activity-table"]')).toBeVisible();
    
    // Cost tracking
    await page.click('[data-testid="cost-analysis"]');
    await expect(page.locator('[data-testid="monthly-cost"]')).toContainText('$0.00');
    await expect(page.locator('[data-testid="projected-cost"]')).toContainText('$50.00'); // 5000 responses * $0.01
    
    // Generate department report
    await page.click('[data-testid="generate-dept-report"]');
    await page.selectOption('[data-testid="report-period"]', 'current-month');
    await page.check('[data-testid="include-costs"]');
    await page.check('[data-testid="include-usage"]');
    await page.check('[data-testid="include-projects"]');
    await page.click('[data-testid="generate-report"]');
    
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-report"]')
    ]);
    
    expect(download.suggestedFilename()).toContain('Psychology-Dept-Report');
  });
});