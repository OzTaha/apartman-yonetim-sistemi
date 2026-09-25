import os from 'node:os';
import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://apartman:apartman@localhost:5433/apartman_test?schema=public';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    server: { deps: { inline: ['nestjs-cls'] } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6380',
      JWT_ACCESS_SECRET: 'e2e-test-secret-e2e-test-secret-e2e-test',
      LOGIN_RATE_LIMIT: '5',
      WEB_ORIGIN: 'http://localhost:5173',
      UPLOAD_DIR: path.join(os.tmpdir(), 'apartman-e2e-uploads'),
      PAYMENT_PROVIDER: 'mock',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
