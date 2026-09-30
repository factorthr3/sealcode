import type { BudgetMode, ModelAliasId, PlanId, TokenUsage } from '@sealcode/shared';
import { totalTokens } from '@sealcode/shared';

/** Everything the gateway needs to know about a key, resolved in one lookup. */
export interface KeyContext {
  keyId: string;
  orgId: string;
  userId: string;
  revoked: boolean;
  orgStatus: 'trial' | 'active' | 'suspended';
  plan: PlanId;
  trialEndsAt: Date | null;
  rateLimitRpm: number;
  budgetMode: BudgetMode;
  /** Monthly org budget in tokens; `null` means unlimited. */
  orgBudgetTokens: number | null;
  /** Monthly budget for this key's seat in tokens; `null` means none. */
  seatBudgetTokens: number | null;
}

export type Endpoint = 'messages' | 'chat_completions';

/** One row of the audit log. Metadata only: never content. */
export interface UsageRecord {
  requestId: string;
  orgId: string;
  userId: string;
  keyId: string;
  endpoint: Endpoint;
  modelAlias: ModelAliasId | null;
  upstreamModel: string | null;
  usage: TokenUsage;
  status: number;
  errorType: string | null;
  latencyMs: number;
  ttfbMs: number | null;
  receiptId: string | null;
  stream: boolean;
  createdAt: Date;
}

export interface MonthUsage {
  orgTokens: number;
  seatTokens: number;
}

export interface GatewayStore {
  /** Look a key up by its peppered hash. Returns revoked keys too, so the error can say so. */
  findKey(hash: string): Promise<KeyContext | null>;
  getMonthUsage(orgId: string, userId: string, period: string): Promise<MonthUsage>;
  recordUsage(record: UsageRecord): Promise<void>;
  touchKey(keyId: string, at: Date): Promise<void>;
  playgroundTokensToday(day: string): Promise<number>;
  recordPlaygroundUsage(day: string, tokens: number): Promise<void>;
}

/** `YYYY-MM` in UTC: the budget period. */
export function periodOf(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/** `YYYY-MM-DD` in UTC. */
export function dayOf(at: Date): string {
  return at.toISOString().slice(0, 10);
}

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
