// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config. The code-style rules from AGENTS.md are enforced here so
 * they hold without anyone remembering them.
 */
export default tseslint.config(
  { ignores: ['node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'max-lines': ['error', { max: 480, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='then']",
          message: 'Prefer async/await over .then() chains (AGENTS.md).',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Named exports only — no default exports (AGENTS.md).',
        },
      ],
    },
  },
  {
    // The flat config itself must default-export.
    files: ['eslint.config.mjs'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
