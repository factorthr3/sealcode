/**
 * Plans, trial terms, limits and the playground allowance. This file is the single source of
 * truth for the gateway, the dashboard's usage statements and the pricing page. All prices are
 * USD starting hypotheses from docs/BRIEF.md.
 */

export type PaidPlanId = 'team' | 'business' | 'enterprise';
export type PlanId = 'trial' | PaidPlanId;
export type BillingInterval = 'monthly' | 'annual';

export interface PlanDefinition {
  id: PaidPlanId;
  name: string;
  tagline: string;
  /** Per seat per month. `null` for plans priced by quote. */
  pricePerSeatMonthly: number | null;
  pricePerSeatAnnual: number | null;
  platformFeeMonthly: number | null;
  minSeats: number;
  /** Pooled across the org. `null` means set per contract. */
  includedTokensPerSeat: number | null;
  rateLimitRpm: number;
  features: string[];
  highlighted: boolean;
}

export const PLANS: Record<PaidPlanId, PlanDefinition> = {
  team: {
    id: 'team',
    name: 'Team',
    tagline: 'For product teams getting started with confidential AI coding.',
    pricePerSeatMonthly: 59,
    pricePerSeatAnnual: 49,
    platformFeeMonthly: null,
    minSeats: 3,
    includedTokensPerSeat: 20_000_000,
    rateLimitRpm: 240,
    features: [
      'Confidential gateway for Claude Code, OpenCode, Cline and Continue',
      '20M tokens per seat per month, pooled across the org',
      'Admin dashboard with seats, keys and budgets',
      'Metadata-only audit log with receipt verification',
      'Public trust center and attestation',
      'Email support',
    ],
    highlighted: false,
  },
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'For regulated teams that need contracts, exports and controls.',
    pricePerSeatMonthly: 99,
    pricePerSeatAnnual: 79,
    platformFeeMonthly: null,
    minSeats: 10,
    includedTokensPerSeat: 40_000_000,
    rateLimitRpm: 480,
    features: [
      'Everything in Team',
      '40M tokens per seat per month, pooled across the org',
      'SSO and SCIM (shipping after launch)',
      'Audit export API and per-team budgets',
      'Data processing agreement',
      'Priority support',
    ],
    highlighted: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Dedicated infrastructure and security review support.',
    pricePerSeatMonthly: null,
    pricePerSeatAnnual: null,
    platformFeeMonthly: 2500,
    minSeats: 50,
    includedTokensPerSeat: null,
    rateLimitRpm: 1_000,
    features: [
      'Everything in Business',
      'Dedicated CVM and custom domain',
      'Dedicated GPU TEE model option',
      'SLA',
      'Security review support',
    ],
    highlighted: false,
  },
};

export const PAID_PLAN_IDS = Object.keys(PLANS) as PaidPlanId[];

/**
 * Annual discounts stay hidden until the spike confirms prompt caching: without it, full-use
 * margin on annual Business pricing falls to 22% (docs/BRIEF.md, unit economics).
 */
export const ANNUAL_PRICING_ENABLED = false;

/** Self-serve trial: no card, no Stripe. Activation happens when the customer contacts us. */
export const TRIAL = {
  days: 14,
  // The owner plus five teammates, so a team can run the full Claude Code flow.
  maxSeats: 6,
  pooledTokens: 20_000_000,
  // Claude Code fans out to parallel sub-agents, so per-key limits leave headroom for bursts.
  rateLimitRpm: 120,
} as const;

/** Overage per 1M tokens once the pooled allowance is used (about 45% over upstream cost). */
export const OVERAGE_PER_MTOK = {
  input: 2.5,
  cachedInput: 0.5,
  output: 8,
} as const;

export const BUDGET_ALERT_THRESHOLDS = [50, 80, 100] as const;
export type BudgetAlertThreshold = (typeof BUDGET_ALERT_THRESHOLDS)[number];

export type BudgetMode = 'hard' | 'soft';

/**
 * The anonymous playground on the landing page. Tokens are short-lived and signed by the web app;
 * the browser talks to the gateway directly so the web app never sees prompt content.
 */
export const PLAYGROUND = {
  tokenTtlSeconds: 15 * 60,
  maxRequestsPerToken: 12,
  maxOutputTokens: 1024,
  maxRequestBytes: 48 * 1024,
  requestsPerMinute: 6,
  tokensIssuedPerIpPerHour: 6,
  dailyTokenCap: 3_000_000,
  models: ['sealcode-pro', 'sealcode-fast'] as const,
  defaultModel: 'sealcode-pro' as const,
} as const;

export const SALES_EMAIL = 'sales@sealcode.dev';
export const SUPPORT_EMAIL = 'support@sealcode.dev';
export const SECURITY_EMAIL = 'security@sealcode.dev';

export function planName(plan: PlanId): string {
  return plan === 'trial' ? 'Trial' : PLANS[plan].name;
}

/** Monthly pooled token allowance for an org, or `null` when set per contract. */
export function pooledAllowance(plan: PlanId, seats: number): number | null {
  if (plan === 'trial') return TRIAL.pooledTokens;
  const perSeat = PLANS[plan].includedTokensPerSeat;
  return perSeat === null ? null : perSeat * seats;
}

export function rateLimitFor(plan: PlanId): number {
  return plan === 'trial' ? TRIAL.rateLimitRpm : PLANS[plan].rateLimitRpm;
}

export function maxSeatsFor(plan: PlanId, purchasedSeats: number): number {
  return plan === 'trial' ? TRIAL.maxSeats : purchasedSeats;
}
