import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // 'server-only' throws outside Next's server bundle; tests run on the server side anyway.
      'server-only': path.resolve(__dirname, 'test/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://eci:eci@localhost:5432/eci_test',
      AUTH_SECRET: 'test-secret-test-secret-test-secret-1234',
      SITE_URL: 'http://localhost:3000',
      EMAIL_MODE: 'log',
    },
  },
});
