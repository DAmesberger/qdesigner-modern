import { test, expect } from '@playwright/test';
import { createTestUser, setupTestOrganization } from '../helpers/auth';

test.describe('Data Analysis Workflow - Data Scientist Journey', () => {
  let dataScientist: any;
  let organization: any;
  let project: any;
  let studyWithData: any;
  
  test.beforeAll(async () => {
    // Set up organization with data scientist role
    const setup = await setupTestOrganization();
    organization = setup.organization;
    project = setup.project;
    
    dataScientist = await createTestUser({
      email: `data-scientist-${Date.now()}@example.com`,
      role: 'viewer', // Read-only access to data
      organizationId: organization.id
    });
    
    // Create study with sample data
    studyWithData = {
      id: 'study-with-data',
      name: 'Completed Stroop Study',
      participantCount: 87,
      completionRate: 0.92
    };
  });
  
  test('analyze study data with built-in tools and export options', async ({ page }) => {
    // Login as data scientist
    await page.goto('/login');
    await page.fill('[data-testid="email"]', dataScientist.email);
    await page.fill('[data-testid="password"]', dataScientist.password);
    await page.click('[data-testid="login-button"]');
    
    // Step 1: Monitor real-time data collection
    await page.goto(`/projects/${project.id}/studies/${studyWithData.id}/monitor`);
    
    // Real-time dashboard
    await expect(page.locator('[data-testid="live-participants"]')).toContainText('3 active');
    await expect(page.locator('[data-testid="total-responses"]')).toContainText('87 completed');
    await expect(page.locator('[data-testid="completion-rate"]')).toContainText('92%');
    await expect(page.locator('[data-testid="avg-duration"]')).toContainText('24.3 min');
    
    // Live data stream
    await expect(page.locator('[data-testid="data-stream"]')).toBeVisible();
    await page.waitForTimeout(2000); // Watch real-time updates
    
    // Check for anomalies
    const anomalyCount = await page.locator('[data-testid="anomaly-count"]').textContent();
    if (parseInt(anomalyCount || '0') > 0) {
      await page.click('[data-testid="view-anomalies"]');
      await expect(page.locator('[data-testid="anomaly-list"]')).toBeVisible();
      
      // Example anomaly: extremely fast responses
      await expect(page.locator('[data-testid="anomaly-type"]').first()).toContainText('Rapid responses');
      await expect(page.locator('[data-testid="anomaly-participant"]').first()).toContainText('P00045');
    }
    
    // Step 2: Quality Control
    await page.click('[data-testid="quality-control-tab"]');
    
    // Automated validation results
    await expect(page.locator('[data-testid="validation-passed"]')).toContainText('83');
    await expect(page.locator('[data-testid="validation-warnings"]')).toContainText('3');
    await expect(page.locator('[data-testid="validation-failed"]')).toContainText('1');
    
    // Review flagged responses
    await page.click('[data-testid="review-flagged"]');
    
    // Check specific issues
    await expect(page.locator('[data-testid="issue-straight-lining"]')).toBeVisible();
    await expect(page.locator('[data-testid="issue-too-fast"]')).toBeVisible();
    await expect(page.locator('[data-testid="issue-incomplete"]')).toBeVisible();
    
    // Apply filters
    await page.click('[data-testid="apply-quality-filters"]');
    await page.check('[data-testid="exclude-incomplete"]');
    await page.check('[data-testid="exclude-outliers"]');
    await page.fill('[data-testid="min-duration"]', '10');
    await page.fill('[data-testid="max-duration"]', '60');
    await page.click('[data-testid="update-filters"]');
    
    // Verify filtered dataset
    await expect(page.locator('[data-testid="filtered-count"]')).toContainText('82 participants');
    
    // Step 3: Exploratory Data Analysis
    await page.click('[data-testid="analysis-tab"]');
    
    // Variable selection
    await page.click('[data-testid="variable-selector"]');
    await page.check('[data-testid="var-reaction-time"]');
    await page.check('[data-testid="var-accuracy"]');
    await page.check('[data-testid="var-interference-effect"]');
    await page.check('[data-testid="var-age"]');
    await page.check('[data-testid="var-education"]');
    
    // Generate descriptive statistics
    await page.click('[data-testid="generate-descriptives"]');
    await page.waitForSelector('[data-testid="descriptives-table"]');
    
    // Verify statistics
    await expect(page.locator('[data-testid="mean-rt"]')).toContainText('523.4 ms');
    await expect(page.locator('[data-testid="sd-rt"]')).toContainText('78.2 ms');
    await expect(page.locator('[data-testid="mean-accuracy"]')).toContainText('94.3%');
    
    // Create visualizations
    await page.click('[data-testid="visualization-builder"]');
    
    // Reaction time distribution
    await page.selectOption('[data-testid="chart-type"]', 'histogram');
    await page.selectOption('[data-testid="x-variable"]', 'reaction_time');
    await page.click('[data-testid="create-chart"]');
    
    await expect(page.locator('[data-testid="chart-rt-distribution"]')).toBeVisible();
    
    // Interference effect by age group
    await page.click('[data-testid="add-visualization"]');
    await page.selectOption('[data-testid="chart-type"]', 'boxplot');
    await page.selectOption('[data-testid="x-variable"]', 'age_group');
    await page.selectOption('[data-testid="y-variable"]', 'interference_effect');
    await page.click('[data-testid="create-chart"]');
    
    // Customize visualization
    await page.click('[data-testid="chart-options"]');
    await page.check('[data-testid="show-data-points"]');
    await page.check('[data-testid="show-mean-line"]');
    await page.selectOption('[data-testid="color-scheme"]', 'colorblind-safe');
    
    // Step 4: Statistical Analysis
    await page.click('[data-testid="statistics-tab"]');
    
    // Run t-test for interference effect
    await page.click('[data-testid="new-analysis"]');
    await page.selectOption('[data-testid="analysis-type"]', 'paired-t-test');
    await page.selectOption('[data-testid="variable-1"]', 'rt_congruent');
    await page.selectOption('[data-testid="variable-2"]', 'rt_incongruent');
    await page.click('[data-testid="run-analysis"]');
    
    // Check results
    await page.waitForSelector('[data-testid="analysis-results"]');
    await expect(page.locator('[data-testid="t-statistic"]')).toContainText('t(81) = -8.34');
    await expect(page.locator('[data-testid="p-value"]')).toContainText('p < .001');
    await expect(page.locator('[data-testid="cohens-d"]')).toContainText("d = 0.92");
    
    // Run ANOVA
    await page.click('[data-testid="new-analysis"]');
    await page.selectOption('[data-testid="analysis-type"]', 'anova');
    await page.selectOption('[data-testid="dependent-var"]', 'interference_effect');
    await page.selectOption('[data-testid="factor-1"]', 'age_group');
    await page.selectOption('[data-testid="factor-2"]', 'education_level');
    await page.click('[data-testid="run-analysis"]');
    
    // Verify ANOVA results
    await expect(page.locator('[data-testid="anova-age-effect"]')).toContainText('F(2,76) = 4.23, p = .018');
    await expect(page.locator('[data-testid="anova-education-effect"]')).toContainText('F(4,76) = 2.87, p = .028');
    await expect(page.locator('[data-testid="anova-interaction"]')).toContainText('F(8,76) = 1.12, p = .358');
    
    // Post-hoc tests
    await page.click('[data-testid="run-posthoc"]');
    await page.selectOption('[data-testid="posthoc-method"]', 'tukey-hsd');
    await page.click('[data-testid="calculate-posthoc"]');
    
    // Step 5: Export Data
    await page.click('[data-testid="export-tab"]');
    
    // Configure export
    await page.selectOption('[data-testid="export-format"]', 'spss');
    await page.check('[data-testid="include-metadata"]');
    await page.check('[data-testid="include-codebook"]');
    await page.check('[data-testid="include-syntax"]');
    
    // Variable selection for export
    await page.click('[data-testid="select-all-variables"]');
    await page.uncheck('[data-testid="export-var-session-id"]'); // Exclude identifiers
    
    // Data transformations
    await page.click('[data-testid="add-transformation"]');
    await page.selectOption('[data-testid="transform-type"]', 'compute');
    await page.fill('[data-testid="new-variable-name"]', 'rt_zscore');
    await page.fill('[data-testid="compute-formula"]', 'ZSCORE(reaction_time)');
    
    // Apply filters to export
    await page.check('[data-testid="apply-current-filters"]');
    
    // Generate export
    await page.click('[data-testid="generate-export"]');
    
    // Wait for processing
    await page.waitForSelector('[data-testid="export-ready"]', { timeout: 30000 });
    
    // Download files
    const [download1] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-data"]')
    ]);
    expect(download1.suggestedFilename()).toContain('.sav');
    
    const [download2] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-syntax"]')
    ]);
    expect(download2.suggestedFilename()).toContain('.sps');
    
    // Step 6: Create Report
    await page.click('[data-testid="reports-tab"]');
    await page.click('[data-testid="create-report"]');
    
    // Report setup
    await page.fill('[data-testid="report-title"]', 'Stroop Task Analysis - November 2024');
    await page.selectOption('[data-testid="report-template"]', 'apa-style');
    
    // Add sections
    await page.click('[data-testid="add-section-descriptives"]');
    await page.click('[data-testid="add-section-inferential"]');
    await page.click('[data-testid="add-section-visualizations"]');
    
    // Include specific analyses
    await page.check('[data-testid="include-demographics-table"]');
    await page.check('[data-testid="include-main-effects"]');
    await page.check('[data-testid="include-interaction-plots"]');
    
    // Generate report
    await page.click('[data-testid="generate-report"]');
    await page.waitForSelector('[data-testid="report-preview"]', { timeout: 20000 });
    
    // Review report
    await expect(page.locator('[data-testid="report-section-method"]')).toContainText('87 participants');
    await expect(page.locator('[data-testid="report-section-results"]')).toContainText('significant Stroop effect');
    
    // Export report
    await page.selectOption('[data-testid="report-format"]', 'pdf');
    await page.click('[data-testid="export-report"]');
    
    // Step 7: Share with Team
    await page.click('[data-testid="share-tab"]');
    
    // Create shareable dashboard
    await page.click('[data-testid="create-dashboard"]');
    await page.fill('[data-testid="dashboard-name"]', 'Stroop Study Results - November 2024');
    
    // Add widgets
    await page.dragAndDrop('[data-testid="widget-key-findings"]', '[data-testid="dashboard-canvas"]');
    await page.dragAndDrop('[data-testid="widget-rt-distribution"]', '[data-testid="dashboard-canvas"]');
    await page.dragAndDrop('[data-testid="widget-group-comparison"]', '[data-testid="dashboard-canvas"]');
    
    // Configure access
    await page.selectOption('[data-testid="share-access"]', 'organization');
    await page.check('[data-testid="allow-comments"]');
    await page.check('[data-testid="allow-export"]');
    
    // Publish dashboard
    await page.click('[data-testid="publish-dashboard"]');
    
    // Get share link
    const shareLink = await page.locator('[data-testid="dashboard-link"]').textContent();
    expect(shareLink).toMatch(/^https:\/\/.+\/dashboard\/.+$/);
    
    // Send to team
    await page.click('[data-testid="notify-team"]');
    await page.fill('[data-testid="notification-message"]', 'Initial analysis complete. Key findings: significant Stroop effect with age moderation.');
    await page.click('[data-testid="send-notification"]');
    
    await expect(page.locator('[data-testid="notification-sent"]')).toContainText('Sent to 4 team members');
  });
  
  test('integrate with external analysis tools', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', dataScientist.email);
    await page.fill('[data-testid="password"]', dataScientist.password);
    await page.click('[data-testid="login-button"]');
    
    // Navigate to integrations
    await page.goto(`/projects/${project.id}/integrations`);
    
    // API Access
    await page.click('[data-testid="api-access-tab"]');
    
    // Generate API key
    await page.click('[data-testid="generate-api-key"]');
    await page.fill('[data-testid="key-name"]', 'R Analysis Script');
    await page.selectOption('[data-testid="key-permissions"]', 'read-only');
    await page.click('[data-testid="create-key"]');
    
    // Copy API key
    const apiKey = await page.locator('[data-testid="api-key-value"]').textContent();
    expect(apiKey).toMatch(/^qd_[a-zA-Z0-9]{32}$/);
    
    // View code examples
    await page.click('[data-testid="view-code-examples"]');
    await page.click('[data-testid="example-r"]');
    
    // Verify R code example
    await expect(page.locator('[data-testid="code-example"]')).toContainText('library(httr)');
    await expect(page.locator('[data-testid="code-example"]')).toContainText(apiKey);
    
    // Python example
    await page.click('[data-testid="example-python"]');
    await expect(page.locator('[data-testid="code-example"]')).toContainText('import requests');
    await expect(page.locator('[data-testid="code-example"]')).toContainText('pandas as pd');
    
    // Jupyter integration
    await page.click('[data-testid="jupyter-tab"]');
    await page.click('[data-testid="connect-jupyter"]');
    
    // Configure connection
    await page.fill('[data-testid="jupyter-url"]', 'https://jupyter.research-institute.edu');
    await page.fill('[data-testid="jupyter-token"]', 'test-token-123');
    await page.click('[data-testid="test-connection"]');
    
    await expect(page.locator('[data-testid="connection-success"]')).toBeVisible();
    
    // Create notebook
    await page.click('[data-testid="create-notebook"]');
    await page.fill('[data-testid="notebook-name"]', 'Stroop Analysis Advanced');
    await page.click('[data-testid="create-and-open"]');
    
    // Verify notebook opened with data connection
    await expect(page.locator('[data-testid="notebook-iframe"]')).toBeVisible();
  });
});