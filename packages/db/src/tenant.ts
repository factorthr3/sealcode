/**
 * Tenant-scoped data access for the dashboard. Every function here is bound to one org at
 * construction and filters by `org_id` in the query itself, including mutations by ID, so a
 * guessed or leaked ID from another org matches nothing. The cross-tenant tests in
 * test/tenant.test.ts exercise every function.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { generateApiKey, hashApiKey, hashToken, randomToken } from '@sealcode/shared/node';
import type { BudgetMode, TokenUsage } from '@sealcode/shared';
import type { Db } from './client';
import {
  adminEvents,
  apiKeys,
  budgets,
  invites,
  memberships,
  orgs,
  usageDaily,
  usageEvents,
  usageMonthly,
  users,
  type Role,
} from './schema';

export const INVITE_TTL_DAYS = 7;

export interface AuditFilter {
  limit?: number;
  /** Rows strictly older than this time (keyset pagination). */
  before?: Date;
  from?: Date;
  to?: Date;
  userId?: string;
  keyId?: string;
}

export function forOrg(db: Db, orgId: string) {
  const inOrg = <T extends { orgId: unknown }>(table: T) => eq(table.orgId as never, orgId);

  async function logAdmin(
    actorUserId: string | null,
    action: string,
    targetId: string | null,
    metadata: Record<string, string | number | boolean | null> | null = null,
  ) {
    await db.insert(adminEvents).values({ orgId, actorUserId, action, targetId, metadata });
  }

  async function roleOf(userId: string): Promise<Role | null> {
    const [row] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(inOrg(memberships), eq(memberships.userId, userId)));
    return row?.role ?? null;
  }

  return {
    orgId,
    logAdmin,

    async org() {
      const [row] = await db.select().from(orgs).where(eq(orgs.id, orgId));
      return row ?? null;
    },

    async rename(name: string, actor: string) {
      await db.update(orgs).set({ name }).where(eq(orgs.id, orgId));
      await logAdmin(actor, 'org.renamed', orgId);
    },

    // --- members ------------------------------------------------------------------------------
    async members() {
      return db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          role: memberships.role,
          joinedAt: memberships.createdAt,
          twoFactor: sql<boolean>`${users.totpEnabledAt} is not null`,
          lastLoginAt: users.lastLoginAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(inOrg(memberships))
        .orderBy(asc(memberships.createdAt));
    },

    roleOf,

    /** Seats in use: members who can hold keys, plus pending invites for such roles. */
    async seatsInUse(): Promise<number> {
      const [m] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(memberships)
        .where(and(inOrg(memberships), inArray(memberships.role, ['owner', 'admin', 'developer'])));
      const [i] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(invites)
        .where(
          and(
            inOrg(invites),
            isNull(invites.acceptedAt),
            isNull(invites.revokedAt),
            gte(invites.expiresAt, new Date()),
            inArray(invites.role, ['owner', 'admin', 'developer']),
          ),
        );
      return (m?.n ?? 0) + (i?.n ?? 0);
    },

    async setRole(userId: string, role: Role, actor: string) {
      const updated = await db
        .update(memberships)
        .set({ role })
        .where(and(inOrg(memberships), eq(memberships.userId, userId)))
        .returning({ userId: memberships.userId });
      if (updated.length) await logAdmin(actor, 'member.role_changed', userId, { role });
      return updated.length > 0;
    },

    /** Remove a member and revoke every key they hold in this org. */
    async removeMember(userId: string, actor: string) {
      return db.transaction(async (tx) => {
        const removed = await tx
          .delete(memberships)
          .where(and(inOrg(memberships), eq(memberships.userId, userId)))
          .returning({ userId: memberships.userId });
        if (!removed.length) return false;
        await tx
          .update(apiKeys)
          .set({ revokedAt: new Date(), revokedBy: actor })
          .where(and(inOrg(apiKeys), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
        await tx
          .insert(adminEvents)
          .values({ orgId, actorUserId: actor, action: 'member.removed', targetId: userId });
        return true;
      });
    },

    // --- invites ------------------------------------------------------------------------------
    async invites() {
      return db
        .select({
          id: invites.id,
          email: invites.email,
          role: invites.role,
          createdAt: invites.createdAt,
          expiresAt: invites.expiresAt,
        })
        .from(invites)
        .where(
          and(
            inOrg(invites),
            isNull(invites.acceptedAt),
            isNull(invites.revokedAt),
            gte(invites.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(invites.createdAt));
    },

    /** Returns the one-time invite token for the email link; only its hash is stored. */
    async createInvite(input: { email: string; role: Role; invitedBy: string }) {
      const token = randomToken();
      const [row] = await db
        .insert(invites)
        .values({
          orgId,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          tokenHash: hashToken(token),
          invitedBy: input.invitedBy,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
        })
        .returning();
      await logAdmin(input.invitedBy, 'member.invited', row!.id, { role: input.role });
      return { token, invite: row! };
    },

    async revokeInvite(inviteId: string, actor: string) {
      const updated = await db
        .update(invites)
        .set({ revokedAt: new Date() })
        .where(and(inOrg(invites), eq(invites.id, inviteId), isNull(invites.acceptedAt)))
        .returning({ id: invites.id });
      if (updated.length) await logAdmin(actor, 'invite.revoked', inviteId);
      return updated.length > 0;
    },

    // --- API keys -----------------------------------------------------------------------------
    async keys(opts: { userId?: string } = {}) {
      return db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          last4: apiKeys.last4,
          userId: apiKeys.userId,
          email: users.email,
          createdAt: apiKeys.createdAt,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .innerJoin(users, eq(users.id, apiKeys.userId))
        .where(and(inOrg(apiKeys), opts.userId ? eq(apiKeys.userId, opts.userId) : undefined))
        .orderBy(desc(apiKeys.createdAt));
    },

    /**
     * Mint a key for a member. The plaintext key is returned once, for display or for the CLI,
     * and never stored.
     */
    async issueKey(input: { userId: string; name: string; actor: string; pepper: string }) {
      const [member] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(inOrg(memberships), eq(memberships.userId, input.userId)));
      if (!member || member.role === 'billing') throw new Error('not_a_seat');
      const generated = generateApiKey();
      const [row] = await db
        .insert(apiKeys)
        .values({
          orgId,
          userId: input.userId,
          name: input.name.slice(0, 80),
          hash: hashApiKey(generated.key, input.pepper),
          prefix: generated.prefix,
          last4: generated.last4,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          last4: apiKeys.last4,
          createdAt: apiKeys.createdAt,
        });
      await logAdmin(input.actor, 'key.issued', row!.id, { for_user: input.userId });
      return { key: generated.key, row: row! };
    },

    async revokeKey(keyId: string, actor: string, opts: { onlyOwnedBy?: string } = {}) {
      const updated = await db
        .update(apiKeys)
        .set({ revokedAt: new Date(), revokedBy: actor })
        .where(
          and(
            inOrg(apiKeys),
            eq(apiKeys.id, keyId),
            isNull(apiKeys.revokedAt),
            opts.onlyOwnedBy ? eq(apiKeys.userId, opts.onlyOwnedBy) : undefined,
          ),
        )
        .returning({ id: apiKeys.id });
      if (updated.length) await logAdmin(actor, 'key.revoked', keyId);
      return updated.length > 0;
    },

    // --- usage and audit ----------------------------------------------------------------------
    async usageDaily(range: { from: string; to: string }) {
      return db
        .select({
          day: usageDaily.day,
          userId: usageDaily.userId,
          keyId: usageDaily.keyId,
          modelAlias: usageDaily.modelAlias,
          requests: usageDaily.requests,
          inputTokens: usageDaily.inputTokens,
          outputTokens: usageDaily.outputTokens,
          cacheReadTokens: usageDaily.cacheReadTokens,
          cacheWriteTokens: usageDaily.cacheWriteTokens,
        })
        .from(usageDaily)
        .where(
          and(
            inOrg(usageDaily),
            gte(usageDaily.day, range.from),
            sql`${usageDaily.day} <= ${range.to}`,
          ),
        )
        .orderBy(asc(usageDaily.day));
    },

    /** Token totals for a month, split by type, straight from the audit log. */
    async monthTotals(period: string): Promise<TokenUsage & { requests: number }> {
      const start = new Date(`${period}-01T00:00:00Z`);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const [row] = await db
        .select({
          requests: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::bigint`,
          outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::bigint`,
          cacheReadTokens: sql<number>`coalesce(sum(${usageEvents.cacheReadTokens}), 0)::bigint`,
          cacheWriteTokens: sql<number>`coalesce(sum(${usageEvents.cacheWriteTokens}), 0)::bigint`,
        })
        .from(usageEvents)
        .where(
          and(
            inOrg(usageEvents),
            gte(usageEvents.createdAt, start),
            lt(usageEvents.createdAt, end),
          ),
        );
      return {
        requests: Number(row?.requests ?? 0),
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
        cacheReadTokens: Number(row?.cacheReadTokens ?? 0),
        cacheWriteTokens: Number(row?.cacheWriteTokens ?? 0),
      };
    },

    async seatUsage(period: string) {
      return db
        .select({ userId: usageMonthly.userId, tokens: usageMonthly.tokens })
        .from(usageMonthly)
        .where(and(inOrg(usageMonthly), eq(usageMonthly.period, period)));
    },

    async audit(filter: AuditFilter = {}) {
      return db
        .select({
          requestId: usageEvents.requestId,
          createdAt: usageEvents.createdAt,
          userId: usageEvents.userId,
          email: users.email,
          keyId: usageEvents.keyId,
          keyName: apiKeys.name,
          keyLast4: apiKeys.last4,
          endpoint: usageEvents.endpoint,
          modelAlias: usageEvents.modelAlias,
          upstreamModel: usageEvents.upstreamModel,
          inputTokens: usageEvents.inputTokens,
          outputTokens: usageEvents.outputTokens,
          cacheReadTokens: usageEvents.cacheReadTokens,
          cacheWriteTokens: usageEvents.cacheWriteTokens,
          latencyMs: usageEvents.latencyMs,
          ttfbMs: usageEvents.ttfbMs,
          status: usageEvents.status,
          errorType: usageEvents.errorType,
          receiptId: usageEvents.receiptId,
          stream: usageEvents.stream,
        })
        .from(usageEvents)
        .leftJoin(users, eq(users.id, usageEvents.userId))
        .leftJoin(apiKeys, and(eq(apiKeys.id, usageEvents.keyId), eq(apiKeys.orgId, orgId)))
        .where(
          and(
            inOrg(usageEvents),
            filter.before ? lt(usageEvents.createdAt, filter.before) : undefined,
            filter.from ? gte(usageEvents.createdAt, filter.from) : undefined,
            filter.to ? lt(usageEvents.createdAt, filter.to) : undefined,
            filter.userId ? eq(usageEvents.userId, filter.userId) : undefined,
            filter.keyId ? eq(usageEvents.keyId, filter.keyId) : undefined,
          ),
        )
        .orderBy(desc(usageEvents.createdAt))
        .limit(Math.min(filter.limit ?? 100, 10_000));
    },

    /** True only if this receipt belongs to one of this org's own requests. */
    async ownsReceipt(receiptId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: usageEvents.requestId })
        .from(usageEvents)
        .where(and(inOrg(usageEvents), eq(usageEvents.receiptId, receiptId)))
        .limit(1);
      return !!row;
    },

    // --- budgets ------------------------------------------------------------------------------
    async budgets() {
      return db.select().from(budgets).where(inOrg(budgets));
    },

    /**
     * Set or clear (`null`) a monthly cap. `scope: 'org'` caps the org; `scope: 'seat'` without a
     * user sets the default per-seat cap, with a user, that seat's cap.
     */
    async setBudget(input: {
      scope: 'org' | 'seat';
      userId?: string | null;
      monthlyTokens: number | null;
      actor: string;
    }) {
      const userId = input.userId ?? null;
      if (userId && !(await roleOf(userId))) throw new Error('not_a_member');
      const match = and(
        inOrg(budgets),
        eq(budgets.scope, input.scope),
        userId ? eq(budgets.userId, userId) : isNull(budgets.userId),
      );
      if (input.monthlyTokens === null) {
        await db.delete(budgets).where(match);
      } else {
        await db
          .insert(budgets)
          .values({ orgId, scope: input.scope, userId, monthlyTokens: input.monthlyTokens })
          .onConflictDoUpdate({
            target: [budgets.orgId, budgets.scope, budgets.userId],
            set: { monthlyTokens: input.monthlyTokens, updatedAt: new Date() },
          });
      }
      await logAdmin(input.actor, 'budget.set', userId, {
        scope: input.scope,
        monthly_tokens: input.monthlyTokens,
      });
    },

    async setBudgetMode(mode: BudgetMode, actor: string) {
      await db.update(orgs).set({ budgetMode: mode }).where(eq(orgs.id, orgId));
      await logAdmin(actor, 'budget.mode_set', orgId, { mode });
    },

    async adminEvents(limit = 100) {
      return db
        .select({
          id: adminEvents.id,
          action: adminEvents.action,
          targetId: adminEvents.targetId,
          metadata: adminEvents.metadata,
          createdAt: adminEvents.createdAt,
          actorEmail: users.email,
        })
        .from(adminEvents)
        .leftJoin(users, eq(users.id, adminEvents.actorUserId))
        .where(inOrg(adminEvents))
        .orderBy(desc(adminEvents.createdAt))
        .limit(limit);
    },
  };
}

export type TenantRepo = ReturnType<typeof forOrg>;
