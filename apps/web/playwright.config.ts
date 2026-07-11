import { defineConfig, devices } from '@playwright/test';
import { DEV_URLS } from './e2e/helpers/dev-urls';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    '**/*.smoke.spec.ts',
    '**/*.regression.spec.ts',
    '**/*.fullstack.spec.ts',
    '**/*.reaction.spec.ts',
    '**/*.form.spec.ts',
  ],
  fullyParallel: !isCI,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: DEV_URLS.frontend,
    testIdAttribute: 'data-testid',
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
    {
      name: 'fullstack-chromium',
      grep: /@fullstack/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      // RT-6 WebGL reaction lane. Needs the SwiftShader software GL fallback for
      // headless CI, and the autoplay override so the engine's AudioContext can
      // resume without a synthetic user gesture. Like @fullstack it drives a real
      // browser against a live backend (provisions studies via the API).
      name: 'reaction-chromium',
      grep: /@reaction/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      // @form lane (issue #35). The DOM fillout path — form-style questions render as
      // Svelte components in the HTML overlay, not WebGL — so it needs no SwiftShader.
      // Like @fullstack it drives a real browser against a live backend (provisions a
      // study via the API, then asserts persisted response values server-side).
      name: 'form-chromium',
      grep: /@form/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'visual-chromium',
      grep: /@visual/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        colorScheme: 'light',
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: DEV_URLS.appPort,
    reuseExistingServer: !isCI,
  },
});
