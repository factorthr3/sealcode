import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';

// Local development reads the monorepo's root .env. Production gets sealed env vars from the CVM.
const rootEnv = new URL('../../.env', import.meta.url);
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@sealcode/shared', '@sealcode/db'],
  // Monorepo root, so the standalone build traces workspace packages.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
};

export default nextConfig;
