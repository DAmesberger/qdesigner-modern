import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,ts,svelte}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
    },
    rules: {
      'no-undef': 'off',
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{js,ts}', 'tests/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
  {
    files: ['e2e/{smoke,regression,fullstack,page-objects}/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='locator'][callee.object.type='Identifier'][callee.object.name='page']",
          message:
            'Avoid `page.locator(...)` in active E2E suites. Use `page.getByTestId(...)` for stable selectors.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='locator'][callee.object.type='MemberExpression'][callee.object.property.name='page']",
          message:
            'Avoid `this.page.locator(...)` in active E2E suites. Use `getByTestId(...)` in page objects.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='waitForSelector']",
          message:
            'Avoid `waitForSelector(...)` in active E2E suites. Use `expect(...).toBeVisible()` with `getByTestId(...)`.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='getByPlaceholder']",
          message:
            'Avoid placeholder selectors in active E2E suites. Add and use a `data-testid` selector instead.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='getByText']",
          message:
            'Avoid text selectors in active E2E suites. Use `getByTestId(...)` for deterministic tests.',
        },
      ],
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.svelte'],
      },
    },
    plugins: {
      svelte,
    },
    rules: {
      ...svelte.configs.recommended.rules,
      // Disable base no-unused-vars for .svelte files — the TS parser already
      // reports unused vars via @typescript-eslint/no-unused-vars, and the base
      // rule produces false positives on Svelte reactive declarations.
      'no-unused-vars': 'off',
      // Disable no-undef for .svelte files — TypeScript already catches
      // undefined variables, and the base rule produces false positives on
      // DOM types (e.g. MediaTrackConstraints) in Svelte TS blocks.
      'no-undef': 'off',
    },
  },
  {
    ignores: ['dist/', 'build/', '.svelte-kit/', 'node_modules/', 'server/'],
  },
];
