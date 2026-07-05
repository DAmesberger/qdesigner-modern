import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup/test-setup.ts', './tests/setup/webgl-mock.ts'],
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      'tests/unit/**/*.{test,spec}.{js,ts}',
      'tests/integration/**/*.{test,spec}.{js,ts}',
      '../../packages/**/src/**/*.{test,spec}.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.svelte-kit',
      'e2e/**/*',
      'tests/e2e/**/*'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'tests',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        '**/.svelte-kit/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    conditions: ['development', 'browser'],
    alias: {
      $lib: path.resolve('./src/lib'),
      $app: path.resolve('./src/app'),
      // Monaco's package entry does not resolve under vitest's vite transform and
      // the editor is never mounted in jsdom component tests; stub it so designer
      // component graphs (ScriptEditor / ScriptEditorOverlay) stay resolvable.
      'monaco-editor': path.resolve('./tests/setup/monaco-editor-stub.ts'),
      '@qdesigner/contracts/generated': path.resolve('../../packages/contracts/src/generated'),
      '@qdesigner/contracts': path.resolve('../../packages/contracts/src/index.ts'),
      '@qdesigner/questionnaire-core/questionnaire': path.resolve('../../packages/questionnaire-core/src/questionnaire.ts'),
      '@qdesigner/questionnaire-core/response': path.resolve('../../packages/questionnaire-core/src/response.ts'),
      '@qdesigner/questionnaire-core/media': path.resolve('../../packages/questionnaire-core/src/media.ts'),
      '@qdesigner/questionnaire-core': path.resolve('../../packages/questionnaire-core/src/index.ts'),
      '@qdesigner/scripting-engine': path.resolve('../../packages/scripting-engine/src')
    }
  }
});
