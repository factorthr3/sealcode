import 'server-only';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  KEY_PEPPER: z.string().min(32),
  PLAYGROUND_TOKEN_SECRET: z.string().min(32),
  TOTP_ENCRYPTION_KEY: z.string().min(40),
  PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  PUBLIC_GATEWAY_URL: z.string().url().default('http://localhost:8787'),
  PHALA_API_KEY: z.string().default(''),
  UPSTREAM_BASE_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('Sealcode <hello@sealcode.ai>'),
  SALES_INBOX: z.string().default('sales@sealcode.ai'),
  SOURCE_REPO_URL: z.string().url().default('https://github.com/factorthr3/sealcode'),
  SOURCE_COMMIT: z.string().default('dev'),
});

export type Env = z.infer<typeof schema> & { production: boolean; receiptsBaseUrl: string };

let cached: Env | null = null;

/** Validated server environment. Reports the names of bad variables, never their values. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid web configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  cached = {
    ...e,
    production,
    PUBLIC_SITE_URL: e.PUBLIC_SITE_URL.replace(/\/+$/, ''),
    PUBLIC_GATEWAY_URL: e.PUBLIC_GATEWAY_URL.replace(/\/+$/, ''),
    // Receipts live on Phala's gateway; in development they come from the mock upstream.
    receiptsBaseUrl: production
      ? 'https://inference.phala.com'
      : (e.UPSTREAM_BASE_URL ?? 'https://inference.phala.com').replace(/\/+$/, ''),
  };
  return cached;
}
