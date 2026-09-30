/**
 * Node-only helpers: key generation and hashing, playground tokens and request IDs. Kept out of
 * the main entry so browser bundles never pull in `node:crypto`.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const API_KEY_PREFIX = 'sc_live_';
export const PLAYGROUND_TOKEN_PREFIX = 'sc_demo_';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** 32 random bytes need at most 43 base62 digits (62^43 > 2^256). */
const KEY_BODY_LENGTH = 43;
const API_KEY_PATTERN = /^sc_live_[0-9A-Za-z]{43}$/;

export function toBase62(bytes: Uint8Array, length: number): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(length, '0');
}

export interface GeneratedApiKey {
  /** Shown to the user once, never stored. */
  key: string;
  prefix: string;
  last4: string;
}

/** `sc_live_` + 32 random bytes in base62. The prefix lets secret scanners spot leaked keys. */
export function generateApiKey(): GeneratedApiKey {
  const key = API_KEY_PREFIX + toBase62(randomBytes(32), KEY_BODY_LENGTH);
  return { key, prefix: API_KEY_PREFIX, last4: key.slice(-4) };
}

export function isApiKeyFormat(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}

/** SHA-256 HMAC keyed with the server-side pepper. The pepper never leaves the TEE. */
export function hashApiKey(key: string, pepper: string): string {
  if (pepper.length < 32) throw new Error('KEY_PEPPER must be at least 32 characters');
  return createHmac('sha256', pepper).update(key).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hash for high-entropy random tokens (sessions, magic links, device codes) before storage. */
export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newRequestId(): string {
  return `req_${randomBytes(12).toString('hex')}`;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface PlaygroundTokenPayload {
  v: 1;
  /** Unique token ID, used for per-token rate limits and usage attribution. */
  jti: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Issue a short-lived playground token. The web app signs it; the gateway verifies it with the
 * same secret. The browser presents it straight to the gateway, so prompts never touch the web
 * app.
 */
export function signPlaygroundToken(
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
): { token: string; payload: PlaygroundTokenPayload } {
  if (secret.length < 32) throw new Error('PLAYGROUND_TOKEN_SECRET must be at least 32 characters');
  const payload: PlaygroundTokenPayload = {
    v: 1,
    jti: randomBytes(12).toString('base64url'),
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const body = PLAYGROUND_TOKEN_PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(body, secret)}`, payload };
}

export function verifyPlaygroundToken(
  token: string,
  secret: string,
  now = Date.now(),
): PlaygroundTokenPayload | null {
  if (!token.startsWith(PLAYGROUND_TOKEN_PREFIX) || token.length > 512) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), sign(body, secret))) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body.slice(PLAYGROUND_TOKEN_PREFIX.length), 'base64url').toString('utf8'),
    ) as Partial<PlaygroundTokenPayload>;
    if (payload.v !== 1 || typeof payload.jti !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp * 1000 <= now) return null;
    return { v: 1, jti: payload.jti, exp: payload.exp };
  } catch {
    return null;
  }
}
