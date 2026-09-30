import { z } from 'zod';
import { parseLogLevel, type LogLevel } from '@sealcode/shared/logger';
import { DEFAULT_CONFIG, type GatewayConfig } from './app';

/**
 * Phala's attested inference gateway. In production this is compiled in rather than read from the
 * environment: sealed environment variables are not part of the attested compose hash, so an
 * operator must not be able to point the gateway at a non-TEE upstream by changing one.
 */
export const PHALA_INFERENCE_URL = 'https://inference.phala.com';

const env = z.object({
  NODE_ENV: z.string().default('development'),
  GATEWAY_PORT: z.coerce.number().int().positive().default(8787),
  UPSTREAM_BASE_URL: z.string().url().optional(),
  PHALA_API_KEY: z.string().default(''),
  KEY_PEPPER: z.string().min(32, 'KEY_PEPPER must be at least 32 characters'),
  PLAYGROUND_TOKEN_SECRET: z.string().min(32).optional(),
  PLAYGROUND_ORIGIN: z.string().optional(),
  PUBLIC_SITE_URL: z.string().url().default('https://sealcode.dev'),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  DEV_API_KEY: z.string().optional(),
});

export interface ServerConfig {
  production: boolean;
  port: number;
  databaseUrl: string | null;
  logLevel: LogLevel;
  devApiKey: string | null;
  gateway: GatewayConfig;
}

export function loadConfig(source: NodeJS.ProcessEnv): ServerConfig {
  const parsed = env.safeParse(source);
  if (!parsed.success) {
    // Report which variables are wrong, never their values.
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid gateway configuration: ${names}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production && !e.PHALA_API_KEY) throw new Error('PHALA_API_KEY is required in production');
  const upstreamBaseUrl = production
    ? PHALA_INFERENCE_URL
    : (e.UPSTREAM_BASE_URL ?? PHALA_INFERENCE_URL);
  return {
    production,
    port: e.GATEWAY_PORT,
    databaseUrl: e.DATABASE_URL || null,
    logLevel: parseLogLevel(e.LOG_LEVEL),
    devApiKey: production ? null : (e.DEV_API_KEY ?? null),
    gateway: {
      ...DEFAULT_CONFIG,
      upstreamBaseUrl: upstreamBaseUrl.replace(/\/+$/, ''),
      upstreamApiKey: e.PHALA_API_KEY || 'mock-phala-key',
      keyPepper: e.KEY_PEPPER,
      playgroundSecret: e.PLAYGROUND_TOKEN_SECRET ?? null,
      playgroundOrigin: e.PLAYGROUND_ORIGIN || null,
      siteUrl: e.PUBLIC_SITE_URL.replace(/\/+$/, ''),
    },
  };
}
