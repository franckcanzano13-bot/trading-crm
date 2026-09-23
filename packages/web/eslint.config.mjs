// Phase 2.7 — Web lint (Next 16 removed `next lint`; flat config instead).
// Errors block CI; warnings are budgeted in .github/workflows/ci.yml and
// shrink over time, the way the server's `any` count went 199 → 0.
import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'tsconfig.tsbuildinfo'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler-era rules shipped with eslint-config-next 16. Real
      // findings (refs read during render, setState in effects) but the
      // monolithic pages predate them; warn for now, burn down with the
      // page splits (roadmap 2.6), then promote to error.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      '@next/next/no-img-element': 'off',
    },
  },
];
