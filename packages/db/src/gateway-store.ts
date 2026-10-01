/**
 * The gateway's view of Postgres. Hot-path queries are single round trips written in SQL, so
 * what the enclave runs is easy to audit.
 */
import type { Sql } from 'postgres';
import {
  BUDGET_ALERT_THRESHOLDS,
  pooledAllowance,
  rateLimitFor,
  totalTokens,
  type BudgetMode,
  type GatewayStore,
  type KeyContext,
  type MonthUsage,
  type PlanId,
  type UsageRecord,
} from '@sealcode/shared';

interface KeyRow {
  key_id: string;
  org_id: string;
  user_id: string;
  revoked_at: Date | string | null;
  is_member: boolean;
  status: KeyContext['orgStatus'];
  plan: PlanId;
  seats: number;
  trial_ends_at: Date | string | null;
  budget_mode: BudgetMode;
  rate_limit_rpm: number | null;
  org_budget: string | null;
  seat_budget_user: string | null;
  seat_budget_default: string | null;
}

const num = (v: string | number | null): number | null => (v === null ? null : Number(v));
/** Timestamps arrive as Date or ISO string depending on whether Drizzle shares the client. */
const toDate = (v: Date | string | null): Date | null =>
  v === null ? null : v instanceof Date ? v : new Date(v);

/** The org's monthly cap: an explicit budget, else the pooled allowance. Trials never exceed it. */
export function resolveOrgBudget(
  plan: PlanId,
  seats: number,
  explicit: number | null,
): number | null {
  const allowance = pooledAllowance(plan, seats);
  if (plan === 'trial') return Math.min(explicit ?? Infinity, allowance ?? Infinity);
  return explicit ?? allowance;
}

export interface BudgetAlert {
  orgId: string;
  scope: 'org' | 'seat';
  userId: string | null;
  period: string;
  threshold: number;
  budget: number;
  used: number;
}

export function createGatewayStore(sql: Sql): GatewayStore & {
  checkBudgetAlerts(orgId: string, userId: string, period: string): Promise<BudgetAlert[]>;
} {
  async function checkBudgetAlerts(
    orgId: string,
    userId: string,
    period: string,
  ): Promise<BudgetAlert[]> {
    const [row] = await sql<
      {
        plan: PlanId;
        seats: number;
        org_budget: string | null;
        seat_budget: string | null;
        org_total: string;
        seat_total: string;
        org_total_all: string;
        seat_total_all: string;
      }[]
    >`
      select o.plan, o.seats,
        (select monthly_tokens from budgets where org_id = o.id and scope = 'org' and user_id is null) as org_budget,
        coalesce(
          (select monthly_tokens from budgets where org_id = o.id and scope = 'seat' and user_id = ${userId}),
          (select monthly_tokens from budgets where org_id = o.id and scope = 'seat' and user_id is null)
        ) as seat_budget,
        coalesce((select sum(tokens) from usage_monthly where org_id = o.id and period = ${period}), 0) as org_total,
        coalesce((select tokens from usage_monthly where org_id = o.id and period = ${period} and user_id = ${userId}), 0) as seat_total,
        coalesce((select sum(tokens) from usage_monthly where org_id = o.id), 0) as org_total_all,
        coalesce((select sum(tokens) from usage_monthly where org_id = o.id and user_id = ${userId}), 0) as seat_total_all
      from orgs o where o.id = ${orgId}`;
    if (!row) return [];
    // A trial's allowance covers the whole trial, so its alerts are too: once each, not monthly.
    const trial = row.plan === 'trial';
    const alertPeriod = trial ? 'trial' : period;
    const checks: {
      scope: 'org' | 'seat';
      userId: string | null;
      budget: number | null;
      used: number;
    }[] = [
      {
        scope: 'org',
        userId: null,
        budget: resolveOrgBudget(row.plan, row.seats, num(row.org_budget)),
        used: Number(trial ? row.org_total_all : row.org_total),
      },
      {
        scope: 'seat',
        userId,
        budget: num(row.seat_budget),
        used: Number(trial ? row.seat_total_all : row.seat_total),
      },
    ];
    const raised: BudgetAlert[] = [];
    for (const check of checks) {
      if (!check.budget || check.budget <= 0) continue;
      for (const threshold of BUDGET_ALERT_THRESHOLDS) {
        if (check.used < (check.budget * threshold) / 100) continue;
        const inserted = await sql`
          insert into budget_alerts (org_id, scope, user_id, period, threshold)
          values (${orgId}, ${check.scope}, ${check.userId}, ${alertPeriod}, ${threshold})
          on conflict on constraint budget_alerts_uniq do nothing
          returning id`;
        if (inserted.length === 0) continue;
        const alert: BudgetAlert = {
          orgId,
          scope: check.scope,
          userId: check.userId,
          period: alertPeriod,
          threshold,
          budget: check.budget,
          used: check.used,
        };
        await sql`
          insert into notifications (kind, org_id, payload)
          values ('budget_alert', ${orgId}, ${JSON.stringify({
            scope: alert.scope,
            userId: alert.userId,
            period: alertPeriod,
            threshold,
            budget: alert.budget,
            used: alert.used,
          })}::jsonb)`;
        raised.push(alert);
      }
    }
    return raised;
  }

  return {
    async findKey(hash: string): Promise<KeyContext | null> {
      const [row] = await sql<KeyRow[]>`
        select k.id as key_id, k.org_id, k.user_id, k.revoked_at,
          exists (select 1 from memberships m where m.org_id = k.org_id and m.user_id = k.user_id) as is_member,
          o.status, o.plan, o.seats, o.trial_ends_at, o.budget_mode, o.rate_limit_rpm,
          (select monthly_tokens from budgets b where b.org_id = o.id and b.scope = 'org' and b.user_id is null) as org_budget,
          (select monthly_tokens from budgets b where b.org_id = o.id and b.scope = 'seat' and b.user_id = k.user_id) as seat_budget_user,
          (select monthly_tokens from budgets b where b.org_id = o.id and b.scope = 'seat' and b.user_id is null) as seat_budget_default
        from api_keys k join orgs o on o.id = k.org_id
        where k.hash = ${hash}`;
      if (!row) return null;
      return {
        keyId: row.key_id,
        orgId: row.org_id,
        userId: row.user_id,
        // A key dies with its owner's membership.
        revoked: row.revoked_at !== null || !row.is_member,
        orgStatus: row.status,
        plan: row.plan,
        trialEndsAt: toDate(row.trial_ends_at),
        rateLimitRpm: row.rate_limit_rpm ?? rateLimitFor(row.plan),
        budgetMode: row.budget_mode,
        orgBudgetTokens: resolveOrgBudget(row.plan, row.seats, num(row.org_budget)),
        seatBudgetTokens: num(row.seat_budget_user) ?? num(row.seat_budget_default),
      };
    },

    async getMonthUsage(orgId: string, userId: string, period: string): Promise<MonthUsage> {
      const [row] = await sql<{ org: string; seat: string }[]>`
        select coalesce(sum(tokens), 0) as org,
               coalesce(sum(tokens) filter (where user_id = ${userId}), 0) as seat
        from usage_monthly where org_id = ${orgId} and period = ${period}`;
      return { orgTokens: Number(row?.org ?? 0), seatTokens: Number(row?.seat ?? 0) };
    },

    async getTrialUsage(orgId: string, userId: string): Promise<MonthUsage> {
      const [row] = await sql<{ org: string; seat: string }[]>`
        select coalesce(sum(tokens), 0) as org,
               coalesce(sum(tokens) filter (where user_id = ${userId}), 0) as seat
        from usage_monthly where org_id = ${orgId}`;
      return { orgTokens: Number(row?.org ?? 0), seatTokens: Number(row?.seat ?? 0) };
    },

    async recordUsage(r: UsageRecord): Promise<void> {
      const tokens = totalTokens(r.usage);
      const period = r.createdAt.toISOString().slice(0, 7);
      const day = r.createdAt.toISOString().slice(0, 10);
      const u = r.usage;
      await sql.begin(async (tx) => {
        await tx`
          insert into usage_events (request_id, org_id, user_id, key_id, endpoint, model_alias, upstream_model,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, latency_ms, ttfb_ms, status,
            error_type, receipt_id, stream, created_at)
          values (${r.requestId}, ${r.orgId}, ${r.userId}, ${r.keyId}, ${r.endpoint}, ${r.modelAlias}, ${r.upstreamModel},
            ${u.inputTokens}, ${u.outputTokens}, ${u.cacheReadTokens}, ${u.cacheWriteTokens}, ${r.latencyMs}, ${r.ttfbMs},
            ${r.status}, ${r.errorType}, ${r.receiptId}, ${r.stream}, ${r.createdAt.toISOString()})`;
        await tx`
          insert into usage_daily as d (org_id, day, user_id, key_id, model_alias, requests,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
          values (${r.orgId}, ${day}, ${r.userId}, ${r.keyId}, ${r.modelAlias ?? 'none'}, 1,
            ${u.inputTokens}, ${u.outputTokens}, ${u.cacheReadTokens}, ${u.cacheWriteTokens})
          on conflict (org_id, day, user_id, key_id, model_alias) do update set
            requests = d.requests + 1,
            input_tokens = d.input_tokens + excluded.input_tokens,
            output_tokens = d.output_tokens + excluded.output_tokens,
            cache_read_tokens = d.cache_read_tokens + excluded.cache_read_tokens,
            cache_write_tokens = d.cache_write_tokens + excluded.cache_write_tokens`;
        if (tokens > 0) {
          await tx`
            insert into usage_monthly as m (org_id, period, user_id, tokens)
            values (${r.orgId}, ${period}, ${r.userId}, ${tokens})
            on conflict (org_id, period, user_id) do update set tokens = m.tokens + excluded.tokens`;
        }
      });
      if (tokens > 0) await checkBudgetAlerts(r.orgId, r.userId, period);
    },

    async touchKey(keyId: string, at: Date): Promise<void> {
      await sql`update api_keys set last_used_at = ${at.toISOString()} where id = ${keyId}`;
    },

    async playgroundTokensToday(day: string): Promise<number> {
      const [row] = await sql<
        { tokens: string }[]
      >`select tokens from playground_usage_daily where day = ${day}`;
      return Number(row?.tokens ?? 0);
    },

    async recordPlaygroundUsage(day: string, tokens: number): Promise<void> {
      await sql`
        insert into playground_usage_daily as p (day, requests, tokens) values (${day}, 1, ${tokens})
        on conflict (day) do update set requests = p.requests + 1, tokens = p.tokens + excluded.tokens`;
    },

    checkBudgetAlerts,
  };
}
