import type { ModelAliasId } from './models';
import type { BudgetMode, PlanId } from './plans';
import type { TokenUsage } from './usage';

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
