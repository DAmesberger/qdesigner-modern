import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.smoke.spec.ts', '**/*.regression.spec.ts'],
  fullyParallel: !isCI,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.VITE_APP_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'smoke-chromium',
      grep: /@smoke/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'regression-chromium',
      grep: /@regression/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'regression-firefox',
      grep: /@regression/,
      use: {
        ...devices['Desktop Firefox'],
      },
    },
    {
      name: 'regression-webkit',
      grep: /@regression/,
      use: {
        ...devices['Desktop Safari'],
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !isCI,
  },
});
