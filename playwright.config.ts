import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  globalSetup: './e2e/setup/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    // Setup project: authenticates test users and saves storage states
    {
      name: 'setup',
      testDir: './e2e/setup',
      testMatch: /auth\.setup\.ts/,
    },

    // Role-based projects using saved auth states
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/admin.json',
      },
      dependencies: ['setup'],
      testIgnore: /setup\//,
    },
    {
      name: 'editor',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/editor.json',
      },
      dependencies: ['setup'],
      testIgnore: /setup\//,
    },
    {
      name: 'viewer',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/viewer.json',
      },
      dependencies: ['setup'],
      testIgnore: /setup\//,
    },

    // Unauthenticated project for login/signup/public page tests
    {
      name: 'unauthenticated',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: [
        /auth\.spec\.ts/,
        /onboarding.*\.spec\.ts/,
        /reaction-test\.spec\.ts/,
        /comprehensive-ui-tests\.spec\.ts/,
      ],
    },

    // Default chromium project (no auth, general tests)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: null,
        deviceScaleFactor: undefined,
        launchOptions: {
          args: ['--start-maximized'],
        },
      },
      dependencies: ['setup'],
      testIgnore: /setup\//,
    },

    // Cross-browser testing
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: '.auth/admin.json',
      },
      dependencies: ['setup'],
      testIgnore: /setup\//,
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: '.auth/admin.json',
      },
      dependencies: ['setup'],
      testIgnore: /setup\//,
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
