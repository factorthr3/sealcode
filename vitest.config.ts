import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/shared/test/**/*.test.ts',
            'packages/cli/test/**/*.test.ts',
            'scripts/attestation/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'gateway',
          include: ['apps/gateway/test/**/*.test.ts'],
          setupFiles: ['apps/gateway/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'db',
          include: ['packages/db/test/**/*.test.ts'],
          globalSetup: ['packages/db/test/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
      {
        resolve: {
          alias: {
            'server-only': new URL('./apps/web/test/server-only-stub.ts', import.meta.url).pathname,
            '@/': new URL('./apps/web/src/', import.meta.url).pathname,
          },
        },
        test: {
          name: 'web',
          include: ['apps/web/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'live',
          include: ['scripts/spike/**/*.live.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
