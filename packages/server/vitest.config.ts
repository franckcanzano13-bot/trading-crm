import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Defaults so any module that loads the validated config (src/config) can
    // be imported by a test without a .env; individual tests still override.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'vitest-jwt-secret-long-enough-0000',
      JWT_REFRESH_SECRET: 'vitest-refresh-secret-long-enough-0',
    },
    coverage: {
      provider: 'v8',
    },
  },
});
