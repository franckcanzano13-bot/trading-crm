// Sprint 6.7 — ESLint flat config (ESLint 9 + typescript-eslint 8).
// Scoped to packages/server src/. Tests, dist, and node_modules are ignored.
//
// Rule budget: see ci.yml — --max-warnings shrinks each sprint to drive the
// `any` count down. Errors are reserved for the small set of issues that
// should *block* a PR; everything else stays at warn so the gate is workable
// while we clean the legacy.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'tests/**', 'prisma/**', '*.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node globals that ESLint's recommended config doesn't include
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        crypto: 'readonly',
        NodeJS: 'readonly',
        BigInt: 'readonly',
      },
    },
    rules: {
      // `any` is rampant in legacy code; downgrade to warn to leave the gate
      // workable while we clean it. Sprint 7 will burn this down — that's
      // the *one* signal we want the gate to track.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow `_unused` arg pattern.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Empty catches are an intentional "best effort" idiom in shutdown
      // paths and audit writes — the upstream code logs separately.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // BigInt literals are fine; turn off the empty-object-type fuss.
      '@typescript-eslint/no-empty-object-type': 'off',
      // We deliberately use require() for lazy/optional deps in a couple of
      // spots — disabling vs warn keeps the warn-budget signal pure.
      '@typescript-eslint/no-require-imports': 'off',
      // Code-style nudge, not worth burning a warn slot.
      'prefer-const': 'off',
    },
  },
];
