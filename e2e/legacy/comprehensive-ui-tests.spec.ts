import { test, expect } from '@playwright/test';

test.describe('QDesigner UI/UX Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('Homepage navigation and elements', async ({ page }) => {
    // Check main navigation elements
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('text=QDesigner')).toBeVisible();
    
    // Check hero section
    await expect(page.locator('h1:has-text("Research-Grade")')).toBeVisible();
    await expect(page.locator('text=Questionnaire Platform')).toBeVisible();
    
    // Check CTA buttons
    await expect(page.locator('a:has-text("Start Free Trial")')).toBeVisible();
    await expect(page.locator('a:has-text("Watch Demo")')).toBeVisible();
    
    // Check stats section
    await expect(page.locator('text=120+')).toBeVisible();
    await expect(page.locator('text=FPS Support')).toBeVisible();
  });

  test('Authentication flow', async ({ page }) => {
    // Navigate to login
    await page.click('a[href="/login"]');
    await expect(page).toHaveURL(/.*\/login/);
    
    // Check login form elements
    await expect(page.locator('text=Sign in to QDesigner')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    
    // Test validation
    await page.click('button[type="submit"]');
    await expect(page.locator('input[name="email"]:invalid')).toBeVisible();
    
    // Login with demo credentials
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    
    // Verify redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 10000 });
    await expect(page.locator('text=demo@example.com')).toBeVisible();
  });

  test('Dashboard UI elements', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/dashboard/);
    
    // Check dashboard layout
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('text=Recent Activity')).toBeVisible();
    await expect(page.locator('text=Quick Actions')).toBeVisible();
    
    // Check navigation menu
    await expect(page.locator('a:has-text("Dashboard")')).toHaveClass(/border-indigo-500/);
    await expect(page.locator('a:has-text("Projects")')).toBeVisible();
    await expect(page.locator('a:has-text("Admin")')).toBeVisible();
  });

  test('Projects page functionality', async ({ page }) => {
    // Login and navigate to projects
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/dashboard/);
    
    await page.click('nav a[href="/projects"]:visible');
    await expect(page).toHaveURL(/.*\/projects/);
    
    // Check projects page elements
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible();
    await expect(page.locator('button:has-text("New Project")')).toBeVisible();
    
    // Check project card
    await expect(page.locator('text=Sample Research Project')).toBeVisible();
    await expect(page.locator('text=A sample project for testing')).toBeVisible();
  });

  test('Mobile responsive navigation', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check mobile menu toggle
    await expect(page.locator('.sidebar-toggle')).not.toBeVisible();
    
    // Login on mobile
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/dashboard/);
    
    // Check mobile menu is visible
    await expect(page.locator('.sidebar-toggle')).toBeVisible();
    
    // Test mobile menu interaction
    await page.click('.sidebar-toggle');
    await expect(page.locator('.mobile-sidebar')).toHaveClass(/translate-x-0/);
  });

  test('Theme toggle functionality', async ({ page }) => {
    // Check theme toggle button
    await expect(page.locator('button[aria-label="Toggle theme"]')).toBeVisible();
    
    // Click theme toggle
    await page.click('button[aria-label="Toggle theme"]');
    
    // Verify theme change (dark mode)
    await expect(page.locator('html')).toHaveClass(/dark/);
    
    // Toggle back to light mode
    await page.click('button[aria-label="Toggle theme"]');
    await expect(page.locator('html')).toHaveClass(/light/);
  });

  test('User menu dropdown', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/dashboard/);
    
    // Click user menu
    await page.click('button[aria-label="User menu"]');
    
    // Check dropdown items
    await expect(page.locator('text=Profile Settings')).toBeVisible();
    await expect(page.locator('text=Organization Settings')).toBeVisible();
    await expect(page.locator('text=Sign out')).toBeVisible();
  });

  test('Create new project modal', async ({ page }) => {
    // Login and navigate to projects
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/dashboard/);
    
    await page.click('nav a[href="/projects"]:visible');
    await page.waitForURL(/.*\/projects/);
    
    // Click new project button
    await page.click('button:has-text("New Project")');
    
    // Check modal elements
    await expect(page.locator('text=Create New Project')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('textarea[name="description"]')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
    await expect(page.locator('button:has-text("Create")')).toBeVisible();
  });

  test('Keyboard navigation', async ({ page }) => {
    // Test tab navigation on login form
    await page.goto('http://localhost:5173/login');
    
    // Focus email field
    await page.locator('input[name="email"]').focus();
    await expect(page.locator('input[name="email"]')).toBeFocused();
    
    // Tab to password field
    await page.keyboard.press('Tab');
    await expect(page.locator('input[name="password"]')).toBeFocused();
    
    // Tab to submit button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Skip forgot password link
    await expect(page.locator('button[type="submit"]')).toBeFocused();
  });

  test('Error handling and user feedback', async ({ page }) => {
    // Test invalid login
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Check for error message
    await expect(page.locator('text=Invalid login credentials')).toBeVisible({ timeout: 5000 });
  });

  test('Loading states', async ({ page }) => {
    // Check loading state on login
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    
    // Start monitoring for loading state
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    // Button should show loading state
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText(/signing in/i);
  });

  test('Accessibility - ARIA labels', async ({ page }) => {
    // Check ARIA labels on homepage
    await expect(page.locator('button[aria-label="Toggle theme"]')).toBeVisible();
    
    // Check ARIA labels after login
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/dashboard/);
    
    await expect(page.locator('button[aria-label="User menu"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Open sidebar"]')).toBeVisible();
  });

  test('Form validation feedback', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    
    // Test email validation
    await page.fill('input[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    await expect(page.locator('input[name="email"]:invalid')).toBeVisible();
    
    // Test required field validation
    await page.fill('input[name="email"]', '');
    await page.click('button[type="submit"]');
    await expect(page.locator('input[name="email"]:invalid')).toBeVisible();
  });
});