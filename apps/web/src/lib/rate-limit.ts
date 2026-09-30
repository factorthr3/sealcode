import 'server-only';
import { headers } from 'next/headers';

const windows = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window limiter for abuse-prone endpoints (sign-in emails, contact, playground tokens). */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 50_000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return true;
  }
  if (w.count >= limit) return false;
  w.count += 1;
  return true;
}

/**
 * The client's address when a proxy supplies it. dstack-ingress is a TCP proxy, so this is often
 * absent; callers fall back to a shared, larger bucket.
 */
export async function clientKey(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim();
  return forwarded || null;
}
