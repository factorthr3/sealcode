import {
  periodOf,
  totalTokens,
  type GatewayStore,
  type KeyContext,
  type MonthUsage,
  type UsageRecord,
} from '@sealcode/shared';

export {
  dayOf,
  periodOf,
  type Endpoint,
  type GatewayStore,
  type KeyContext,
  type MonthUsage,
  type UsageRecord,
} from '@sealcode/shared';

/** Seconds until the current UTC month ends, used as `retry-after` for exhausted budgets. */
export function secondsUntilPeriodEnd(at: Date): number {
  const next = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - at.getTime()) / 1000));
}

/** In-memory store for tests and database-free local development. */
export class MemoryStore implements GatewayStore {
  readonly keys = new Map<string, KeyContext>();
  readonly records: UsageRecord[] = [];
  readonly touched = new Map<string, Date>();
  readonly playground = new Map<string, number>();

  addKey(hash: string, ctx: KeyContext): void {
    this.keys.set(hash, ctx);
  }

  async findKey(hash: string): Promise<KeyContext | null> {
    const ctx = this.keys.get(hash);
    return ctx ? { ...ctx } : null;
  }

  async getMonthUsage(orgId: string, userId: string, period: string): Promise<MonthUsage> {
    let orgTokens = 0;
    let seatTokens = 0;
    for (const r of this.records) {
      if (r.orgId !== orgId || periodOf(r.createdAt) !== period) continue;
      const t = totalTokens(r.usage);
      orgTokens += t;
      if (r.userId === userId) seatTokens += t;
    }
    return { orgTokens, seatTokens };
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    this.records.push(record);
  }

  async touchKey(keyId: string, at: Date): Promise<void> {
    this.touched.set(keyId, at);
  }

  async playgroundTokensToday(day: string): Promise<number> {
    return this.playground.get(day) ?? 0;
  }

  async recordPlaygroundUsage(day: string, tokens: number): Promise<void> {
    this.playground.set(day, (this.playground.get(day) ?? 0) + tokens);
  }
}
