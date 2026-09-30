import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/shared/test/**/*.test.ts', 'packages/cli/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'gateway',
          include: ['apps/gateway/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'db',
          include: ['packages/db/test/**/*.test.ts'],
          fileParallelism: false,
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
