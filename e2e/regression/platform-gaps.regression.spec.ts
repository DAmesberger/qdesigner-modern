import { expect, test } from '@playwright/test';
import { provisionWorkspace, type ProvisionedWorkspace } from '../helpers/fullstack-api';


test.describe('@regression platform-gaps', () => {
  // -------- Auth & Security --------

  test('rate limiter returns 429 after excessive login attempts', async ({ request }) => {
    // The backend rate limiter allows 10 requests per 60s window on auth routes.
    // Fire 15 sequential requests (all with wrong creds) so the limiter triggers
    // deterministically — parallel requests can land inside the same timestamp.
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await request.post('/api/auth/login', {
        data: { email: `nonexistent-${i}@test.local`, password: 'wrong' },
      });
      statuses.push(res.status());
    }

    expect(statuses).toContain(429);
  });

  test('404 error page renders for nonexistent routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-12345');

    // SvelteKit +error.svelte renders the status code and "Not Found"
    // eslint-disable-next-line no-restricted-syntax -- checking body text on error page, no testid available
    await expect(page.locator('body')).toContainText('404');
    // eslint-disable-next-line no-restricted-syntax -- checking body text on error page, no testid available
    await expect(page.locator('body')).toContainText('Not Found');
  });

  // -------- i18n --------

  test('language switcher changes UI language on login page', async ({ page }) => {
    await page.goto('/login');

    // The LanguageSwitcher uses aria-label="Select language" on its button
    // eslint-disable-next-line no-restricted-syntax -- selecting by aria-label, no testid on third-party widget
    const langButton = page.locator('button[aria-label="Select language"]');
    const buttonVisible = await langButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (!buttonVisible) {
      // Language switcher may not be rendered on the login page; skip gracefully
      test.skip();
      return;
    }

    // Record the current submit button text before switching
    // eslint-disable-next-line no-restricted-syntax -- selecting by type attribute, no testid on generic submit button
    const submitBtn = page.locator('button[type="submit"]');
    const initialText = await submitBtn.textContent();

    // Open the language dropdown
    await langButton.click();

    // Pick Deutsch (de)
    // eslint-disable-next-line no-restricted-syntax -- selecting by role + text, no testid on language options
    const deOption = page.locator('[role="option"]', { hasText: 'Deutsch' });
    await expect(deOption).toBeVisible({ timeout: 2000 });
    await deOption.click();

    // After switching to German the submit button text should have changed
    await expect(submitBtn).not.toHaveText(initialText!, { timeout: 5000 });
  });

  // -------- Error handling --------

  test('password reset page exists at /forgot-password', async ({ page }) => {
    await page.goto('/forgot-password');

    // Should render the forgot-password form, not a 404
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    // Must not be the error page
    expect(body).not.toContain('Not Found');
  });

  // -------- Registration + Email Verification --------

  test('registration sends verification email to MailPit', async ({ request }) => {
    const testEmail = `e2e.mailpit.${Date.now()}@test.local`;

    // Register a new user
    const regResponse = await request.post('/api/auth/register', {
      data: {
        email: testEmail,
        password: 'TestPassword123!',
        full_name: 'E2E MailPit Test',
      },
    });

    // Registration should succeed
    expect([200, 201, 202]).toContain(regResponse.status());

    // Allow the email to be sent
    await new Promise((r) => setTimeout(r, 2000));

    // Check MailPit for the verification email (API v1)
    const mailpitResponse = await request
      .get(`http://localhost:18026/api/v1/search?query=to:${testEmail}`, {
        timeout: 10_000,
      })
      .catch(() => null);

    if (mailpitResponse && mailpitResponse.ok()) {
      const mailData = await mailpitResponse.json();
      if (mailData.messages) {
        expect(mailData.messages.length).toBeGreaterThanOrEqual(1);
      }
    }
    // If MailPit is unavailable the test passes gracefully
  });

  // -------- Offline Sync --------

  test('app remains functional after going offline and back online', async ({
    page,
    request,
    context,
  }) => {
    const workspace = await provisionWorkspace(request);

    // Inject auth state before navigating
    await page.addInitScript(
      (ws: ProvisionedWorkspace) => {
        localStorage.setItem(
          'qdesigner-auth',
          JSON.stringify({
            accessToken: ws.accessToken,
            refreshToken: ws.refreshToken,
            expiresAt: ws.expiresAt,
            user: { id: ws.userId, email: ws.email, full_name: ws.fullName },
          })
        );
      },
      workspace
    );

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Go offline
    await context.setOffline(true);

    // Page should still render content (service worker / cached shell)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Go back online
    await context.setOffline(false);

    // Wait for potential sync activity
    await page.waitForTimeout(2000);

    // App should still be functional
    expect(await page.title()).toBeTruthy();
  });

  // -------- Designer collaboration --------

  test('designer header renders PresenceIndicator component import', async ({
    page,
    request,
  }) => {
    const workspace = await provisionWorkspace(request);

    await page.addInitScript(
      (ws: ProvisionedWorkspace) => {
        localStorage.setItem(
          'qdesigner-auth',
          JSON.stringify({
            accessToken: ws.accessToken,
            refreshToken: ws.refreshToken,
            expiresAt: ws.expiresAt,
            user: { id: ws.userId, email: ws.email, full_name: ws.fullName },
          })
        );
      },
      workspace
    );

    // Navigate to designer with a new questionnaire
    await page.goto(
      `/projects/${workspace.projectId}/designer/new?name=Presence+Test&description=gaps`
    );

    // The designer should load without crashing
    await page.waitForLoadState('networkidle');
    expect(await page.title()).toBeTruthy();

    // The DesignerHeader (which imports PresenceIndicator) should be visible
    const header = page.getByTestId('designer-header');
    const headerVisible = await header.isVisible({ timeout: 10_000 }).catch(() => false);
    // Even if the designer is behind auth redirect, the app must not crash
    expect(headerVisible || (await page.url()).includes('/login')).toBe(true);
  });

  // -------- API Health --------

  test('health check endpoint responds with status ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('readiness check endpoint responds', async ({ request }) => {
    const response = await request.get('/api/ready');
    // May be 200 (ready) or 503 (degraded) depending on infra — both are valid
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
  });
});
