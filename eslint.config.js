import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.worktrees', 'playwright-report', 'test-results', 'api/index.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { console: 'readonly', process: 'readonly', window: 'readonly', document: 'readonly', navigator: 'readonly', fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', localStorage: 'readonly', AbortController: 'readonly', HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLSelectElement: 'readonly', KeyboardEvent: 'readonly', Buffer: 'readonly', URL: 'readonly', Request: 'readonly', Response: 'readonly', Headers: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
