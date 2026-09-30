/**
 * In-memory token buckets for per-key rate limits. v1 runs a single gateway replica, so memory is
 * the source of truth; budgets, which must survive restarts, live in Postgres.
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Take one request from `id`'s bucket, which holds `perMinute` requests and refills
   * continuously. Returns the whole seconds to wait when the bucket is empty.
   */
  take(
    id: string,
    perMinute: number,
    now: number,
  ): { ok: true } | { ok: false; retryAfter: number } {
    const refillPerMs = perMinute / 60_000;
    const bucket = this.buckets.get(id) ?? { tokens: perMinute, updatedAt: now };
    bucket.tokens = Math.min(perMinute, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;
    this.buckets.set(id, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true };
    }
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000)),
    };
  }

  /** Drop buckets that have been full for a while, to bound memory. */
  sweep(now: number, idleMs = 10 * 60_000): void {
    for (const [id, b] of this.buckets) if (now - b.updatedAt > idleMs) this.buckets.delete(id);
  }
}

/** A small TTL cache for key lookups and usage totals. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 10_000,
  ) {}

  get(key: string, now: number): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expires <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: V, now: number): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: now + this.ttlMs });
  }

  update(key: string, fn: (v: V) => V): void {
    const e = this.entries.get(key);
    if (e) e.value = fn(e.value);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
