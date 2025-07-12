import { test, expect } from '@playwright/test';
import { createTestUser, setupTestOrganization } from '../helpers/auth';

test.describe('Study Design Workflow - Research Designer Journey', () => {
  let designer: any;
  let organization: any;
  let project: any;
  
  test.beforeAll(async () => {
    // Set up organization with research designer
    const setup = await setupTestOrganization();
    organization = setup.organization;
    project = setup.project;
    
    designer = await createTestUser({
      email: `designer-${Date.now()}@example.com`,
      role: 'editor',
      organizationId: organization.id
    });
  });
  
  test('create complex psychological experiment with advanced features', async ({ page }) => {
    // Login as research designer
    await page.goto('/login');
    await page.fill('[data-testid="email"]', designer.email);
    await page.fill('[data-testid="password"]', designer.password);
    await page.click('[data-testid="login-button"]');
    
    // Step 1: Create Study
    await page.goto(`/projects/${project.id}`);
    await page.click('[data-testid="create-study"]');
    
    // Define study objectives
    await page.fill('[data-testid="study-name"]', 'Stroop Task with Working Memory Assessment');
    await page.fill('[data-testid="study-description"]', 'Investigating interference effects and working memory capacity');
    await page.selectOption('[data-testid="study-type"]', 'experiment');
    await page.fill('[data-testid="estimated-duration"]', '25');
    await page.fill('[data-testid="participant-target"]', '100');
    
    await page.click('[data-testid="continue-to-design"]');
    
    // Step 2: Design Protocol using Visual Editor
    await page.waitForSelector('[data-testid="visual-designer"]');
    
    // Add welcome screen
    await page.click('[data-testid="add-screen"]');
    await page.selectOption('[data-testid="screen-type"]', 'instruction');
    await page.fill('[data-testid="screen-title"]', 'Welcome to the Study');
    await page.fill('[data-testid="instruction-text"]', `
      Thank you for participating in our cognitive psychology study.
      
      This study consists of two main tasks:
      1. A Stroop color-word task
      2. A working memory assessment
      
      The entire study will take approximately 25 minutes.
      
      Please ensure you are in a quiet environment and can complete the study without interruption.
    `);
    
    // Add consent form
    await page.click('[data-testid="add-screen"]');
    await page.selectOption('[data-testid="screen-type"]', 'consent');
    await page.click('[data-testid="use-template-consent"]');
    await page.selectOption('[data-testid="consent-template"]', 'irb-approved-adult');
    
    // Customize consent
    await page.fill('[data-testid="researcher-name"]', 'Dr. Lisa Chang');
    await page.fill('[data-testid="institution"]', organization.name);
    await page.fill('[data-testid="irb-number"]', 'IRB-2024-001');
    
    // Add demographic questions
    await page.click('[data-testid="add-screen"]');
    await page.selectOption('[data-testid="screen-type"]', 'questionnaire');
    await page.fill('[data-testid="screen-title"]', 'Background Information');
    
    // Age question
    await page.dragAndDrop('[data-testid="question-number"]', '[data-testid="screen-canvas"]');
    await page.fill('[data-testid="question-text"]', 'What is your age?');
    await page.fill('[data-testid="number-min"]', '18');
    await page.fill('[data-testid="number-max"]', '100');
    await page.check('[data-testid="required"]');
    
    // Education level
    await page.dragAndDrop('[data-testid="question-dropdown"]', '[data-testid="screen-canvas"]');
    await page.fill('[data-testid="question-text"]', 'Highest level of education completed:');
    const educationOptions = [
      'High school or equivalent',
      'Some college',
      'Bachelor\'s degree',
      'Master\'s degree',
      'Doctoral degree',
      'Other'
    ];
    for (let i = 0; i < educationOptions.length; i++) {
      if (i > 0) await page.click('[data-testid="add-option"]');
      await page.fill(`[data-testid="option-${i}"]`, educationOptions[i]);
    }
    
    // Step 3: Add Stroop Task with WebGL Rendering
    await page.click('[data-testid="add-screen"]');
    await page.selectOption('[data-testid="screen-type"]', 'experiment');
    await page.fill('[data-testid="screen-title"]', 'Stroop Color-Word Task');
    
    // Configure Stroop parameters
    await page.click('[data-testid="experiment-settings"]');
    await page.selectOption('[data-testid="experiment-template"]', 'stroop-task');
    await page.fill('[data-testid="num-trials"]', '60');
    await page.fill('[data-testid="practice-trials"]', '10');
    
    // Set timing parameters
    await page.fill('[data-testid="fixation-duration"]', '500');
    await page.fill('[data-testid="stimulus-duration"]', '2000');
    await page.fill('[data-testid="iti-min"]', '1000');
    await page.fill('[data-testid="iti-max"]', '1500');
    
    // Configure stimulus conditions
    await page.check('[data-testid="condition-congruent"]');
    await page.check('[data-testid="condition-incongruent"]');
    await page.check('[data-testid="condition-neutral"]');
    
    // Set response keys
    await page.fill('[data-testid="response-key-red"]', 'f');
    await page.fill('[data-testid="response-key-green"]', 'j');
    await page.fill('[data-testid="response-key-blue"]', 'k');
    await page.fill('[data-testid="response-key-yellow"]', 'l');
    
    // Enable WebGL rendering for precise timing
    await page.check('[data-testid="enable-webgl"]');
    await page.check('[data-testid="vsync-timing"]');
    
    // Step 4: Add Working Memory Task
    await page.click('[data-testid="add-screen"]');
    await page.selectOption('[data-testid="screen-type"]', 'experiment');
    await page.fill('[data-testid="screen-title"]', 'Working Memory Task');
    
    await page.click('[data-testid="experiment-settings"]');
    await page.selectOption('[data-testid="experiment-template"]', 'n-back');
    await page.selectOption('[data-testid="n-back-level"]', '2');
    await page.fill('[data-testid="num-blocks"]', '3');
    await page.fill('[data-testid="trials-per-block"]', '20');
    
    // Step 5: Configure Advanced Logic with Scripting
    await page.click('[data-testid="logic-editor-tab"]');
    await page.click('[data-testid="add-variable"]');
    
    // Create computed variables
    await page.fill('[data-testid="variable-name"]', 'stroopInterference');
    await page.selectOption('[data-testid="variable-type"]', 'computed');
    await page.click('[data-testid="open-formula-editor"]');
    
    // Use Monaco editor for formula
    await page.fill('[data-testid="formula-editor"]', `
      // Calculate Stroop interference effect
      const congruentRT = MEAN(FILTER(stroopTask.reactionTimes, stroopTask.condition == "congruent"));
      const incongruentRT = MEAN(FILTER(stroopTask.reactionTimes, stroopTask.condition == "incongruent"));
      return incongruentRT - congruentRT;
    `);
    
    // Add branching logic based on performance
    await page.click('[data-testid="add-branch"]');
    await page.fill('[data-testid="branch-condition"]', 'stroopInterference > 200');
    await page.selectOption('[data-testid="branch-target"]', 'additional-practice');
    
    // Step 6: Add Randomization
    await page.click('[data-testid="randomization-tab"]');
    
    // Configure block randomization
    await page.selectOption('[data-testid="randomization-type"]', 'block');
    await page.fill('[data-testid="block-size"]', '4');
    
    // Add stratification variable
    await page.click('[data-testid="add-stratification"]');
    await page.selectOption('[data-testid="stratify-by"]', 'demographics.age');
    await page.fill('[data-testid="age-groups"]', '18-30,31-50,51+');
    
    // Configure counterbalancing
    await page.check('[data-testid="counterbalance-tasks"]');
    await page.selectOption('[data-testid="counterbalance-method"]', 'latin-square');
    
    // Step 7: Test All Paths
    await page.click('[data-testid="test-mode-tab"]');
    await page.click('[data-testid="start-test"]');
    
    // Run through as test participant
    await page.waitForSelector('[data-testid="test-frame"]');
    const testFrame = page.frameLocator('[data-testid="test-frame"]');
    
    // Complete consent
    await testFrame.locator('[data-testid="consent-agree"]').check();
    await testFrame.locator('[data-testid="continue"]').click();
    
    // Fill demographics
    await testFrame.locator('[data-testid="age-input"]').fill('25');
    await testFrame.locator('[data-testid="education-select"]').selectOption('Bachelor\'s degree');
    await testFrame.locator('[data-testid="continue"]').click();
    
    // Verify Stroop task loads with WebGL
    await expect(testFrame.locator('[data-testid="webgl-canvas"]')).toBeVisible();
    await expect(testFrame.locator('[data-testid="fps-counter"]')).toContainText('60 FPS');
    
    // Complete a few practice trials
    for (let i = 0; i < 3; i++) {
      await testFrame.locator('[data-testid="stimulus"]').waitFor();
      await page.keyboard.press('f'); // Respond to red
      await page.waitForTimeout(1500); // Wait for ITI
    }
    
    // Exit test mode
    await page.click('[data-testid="exit-test"]');
    
    // Step 8: Review and Collaborate
    await page.click('[data-testid="review-tab"]');
    
    // Add collaborator comment
    await page.fill('[data-testid="comment-text"]', 'The Stroop task parameters look good. Should we increase the number of practice trials?');
    await page.click('[data-testid="post-comment"]');
    
    // Request approval from PI
    await page.click('[data-testid="request-approval"]');
    await page.selectOption('[data-testid="approver"]', 'Dr. Lisa Chang');
    await page.fill('[data-testid="approval-note"]', 'Ready for your review. All timing tests passed.');
    await page.click('[data-testid="send-approval-request"]');
    
    // Step 9: Deploy to Production
    await page.waitForSelector('[data-testid="approval-granted"]', { timeout: 5000 });
    
    await page.click('[data-testid="deploy-tab"]');
    
    // Configure deployment settings
    await page.selectOption('[data-testid="deployment-environment"]', 'production');
    await page.check('[data-testid="enable-data-validation"]');
    await page.check('[data-testid="enable-participant-id-validation"]');
    await page.fill('[data-testid="data-retention-days"]', '365');
    
    // Set participant recruitment settings
    await page.selectOption('[data-testid="recruitment-method"]', 'direct-link');
    await page.check('[data-testid="generate-unique-links"]');
    await page.fill('[data-testid="link-expiry-hours"]', '72');
    
    await page.click('[data-testid="deploy-study"]');
    
    // Verify deployment success
    await page.waitForSelector('[data-testid="deployment-success"]');
    await expect(page.locator('[data-testid="study-status"]')).toContainText('Active');
    await expect(page.locator('[data-testid="study-url"]')).toBeVisible();
    
    // Copy study URL
    const studyUrl = await page.locator('[data-testid="study-url"]').textContent();
    expect(studyUrl).toMatch(/^https:\/\/.+\/study\/.+$/);
  });
  
  test('debug complex logic and timing issues', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', designer.email);
    await page.fill('[data-testid="password"]', designer.password);
    await page.click('[data-testid="login-button"]');
    
    // Open existing study with issues
    await page.goto('/designer/study/test-study-with-issues');
    
    // Open logic debugger
    await page.click('[data-testid="debug-mode"]');
    await page.waitForSelector('[data-testid="debugger-panel"]');
    
    // Set breakpoint on variable calculation
    await page.click('[data-testid="variable-stroopAccuracy"]');
    await page.click('[data-testid="add-breakpoint"]');
    
    // Run in debug mode
    await page.click('[data-testid="run-debug"]');
    
    // Step through execution
    await page.waitForSelector('[data-testid="breakpoint-hit"]');
    await expect(page.locator('[data-testid="variable-value"]')).toContainText('undefined');
    
    // Inspect scope
    await page.click('[data-testid="scope-inspector"]');
    await expect(page.locator('[data-testid="scope-variables"]')).toContainText('stroopTask.responses: []');
    
    // Identify issue - responses array is empty
    await page.click('[data-testid="fix-suggestion"]');
    await expect(page.locator('[data-testid="suggestion-text"]')).toContainText('Variable "stroopAccuracy" references empty array');
    
    // Apply suggested fix
    await page.click('[data-testid="apply-fix"]');
    await page.waitForSelector('[data-testid="fix-applied"]');
    
    // Test timing precision
    await page.click('[data-testid="timing-analyzer"]');
    await page.click('[data-testid="run-timing-test"]');
    
    // Wait for timing analysis
    await page.waitForSelector('[data-testid="timing-results"]', { timeout: 10000 });
    
    // Verify timing precision
    await expect(page.locator('[data-testid="frame-consistency"]')).toContainText('99.8%');
    await expect(page.locator('[data-testid="avg-frame-time"]')).toContainText('16.67ms ± 0.1ms');
    await expect(page.locator('[data-testid="dropped-frames"]')).toContainText('0');
    
    // Check for timing warnings
    const warnings = page.locator('[data-testid="timing-warnings"]');
    if (await warnings.count() > 0) {
      // Address any timing issues
      await page.click('[data-testid="optimize-timing"]');
      await page.waitForSelector('[data-testid="optimization-complete"]');
    }
  });
});