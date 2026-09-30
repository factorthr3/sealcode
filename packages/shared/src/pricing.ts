import { MODEL_ALIASES, type ModelAliasId } from './models';
import {
  OVERAGE_PER_MTOK,
  PLANS,
  pooledAllowance,
  type BillingInterval,
  type PlanId,
} from './plans';
import { totalTokens, type TokenUsage } from './usage';

const PER_MTOK = 1_000_000;

/** Round half-up to whole cents, avoiding binary float drift. */
export function roundCents(usd: number): number {
  return Math.round((usd + Number.EPSILON) * 100) / 100;
}

/** What Phala charges us for a request, in USD. */
export function upstreamCostUsd(alias: ModelAliasId, usage: TokenUsage): number {
  const p = MODEL_ALIASES[alias].upstreamPricePerMTok;
  return (
    ((usage.inputTokens + usage.cacheWriteTokens) * p.input +
      usage.cacheReadTokens * p.cacheRead +
      usage.outputTokens * p.output) /
    PER_MTOK
  );
}

/**
 * Blended upstream cost per 1M tokens for a traffic mix. With the brief's assumptions (95% input,
 * 5% output) GLM 5.3 costs $1.55 uncached and $0.79 with 70% of input served from cache.
 */
export function blendedCostPerMTok(
  alias: ModelAliasId,
  mix: { inputShare: number; cachedShareOfInput: number },
): number {
  const p = MODEL_ALIASES[alias].upstreamPricePerMTok;
  const input =
    mix.inputShare *
    ((1 - mix.cachedShareOfInput) * p.input + mix.cachedShareOfInput * p.cacheRead);
  return input + (1 - mix.inputShare) * p.output;
}

/** Overage for a usage mix at list overage rates, before allowance is applied. */
export function listOverageUsd(usage: TokenUsage): number {
  return (
    ((usage.inputTokens + usage.cacheWriteTokens) * OVERAGE_PER_MTOK.input +
      usage.cacheReadTokens * OVERAGE_PER_MTOK.cachedInput +
      usage.outputTokens * OVERAGE_PER_MTOK.output) /
    PER_MTOK
  );
}

export interface MonthlyStatement {
  plan: PlanId;
  seats: number;
  interval: BillingInterval;
  seatFeesUsd: number;
  platformFeeUsd: number;
  allowanceTokens: number | null;
  usedTokens: number;
  overageTokens: number;
  overageUsd: number;
  totalUsd: number;
}

/**
 * The monthly statement used for manual invoicing. Overage is billed on the share of the month's
 * tokens above the pooled allowance, priced at the month's input/cached/output mix, so the
 * statement reproduces from `usage_events` alone.
 */
export function monthlyStatement(input: {
  plan: PlanId;
  seats: number;
  interval: BillingInterval;
  usage: TokenUsage;
}): MonthlyStatement {
  const { plan, seats, interval, usage } = input;
  const used = totalTokens(usage);
  const allowance = pooledAllowance(plan, seats);
  let seatFees = 0;
  let platformFee = 0;
  if (plan !== 'trial') {
    const def = PLANS[plan];
    const perSeat = interval === 'annual' ? def.pricePerSeatAnnual : def.pricePerSeatMonthly;
    seatFees = (perSeat ?? 0) * seats;
    platformFee = def.platformFeeMonthly ?? 0;
  }
  const overageTokens = allowance === null || plan === 'trial' ? 0 : Math.max(0, used - allowance);
  const overageUsd =
    overageTokens > 0 && used > 0 ? roundCents(listOverageUsd(usage) * (overageTokens / used)) : 0;
  return {
    plan,
    seats,
    interval,
    seatFeesUsd: roundCents(seatFees),
    platformFeeUsd: roundCents(platformFee),
    allowanceTokens: allowance,
    usedTokens: used,
    overageTokens,
    overageUsd,
    totalUsd: roundCents(seatFees + platformFee + overageUsd),
  };
}

export function formatUsd(value: number, opts: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(value);
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000)
    return `${+(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return String(value);
}
