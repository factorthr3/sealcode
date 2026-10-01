/**
 * Data access that is not scoped to one org: people, sign-in, org creation, invitations, CLI
 * device logins, sales enquiries and the staff console. Tokens are stored only as hashes.
 */
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { hashToken, randomToken } from '@sealcode/shared/node';
import { maxSeatsFor, TRIAL, type BillingInterval, type PaidPlanId } from '@sealcode/shared';
import type { Db } from './client';
import {
  adminEvents,
  apiKeys,
  deviceCodes,
  invites,
  magicLinks,
  memberships,
  notifications,
  orgs,
  playgroundUsageDaily,
  salesEnquiries,
  sessions,
  subscriptions,
  usageMonthly,
  users,
  type Role,
} from './schema';
import { forOrg } from './tenant';

export const MAGIC_LINK_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 86_400_000;
export const DEVICE_CODE_TTL_MS = 10 * 60_000;
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `${base || 'org'}-${randomToken(4)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, 'x')}`;
}

function userCode(): string {
  const pick = () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return `${Array.from({ length: 4 }, pick).join('')}-${Array.from({ length: 4 }, pick).join('')}`;
}

export function accounts(db: Db) {
  const api = {
    // --- users -----------------------------------------------------------------------------
    async userById(id: string) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row ?? null;
    },

    async userByEmail(email: string) {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.email, normaliseEmail(email)));
      return row ?? null;
    },

    async upsertUser(email: string, name?: string | null) {
      const [row] = await db
        .insert(users)
        .values({ email: normaliseEmail(email), name: name ?? null })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: sql`coalesce(excluded.name, ${users.name})` },
        })
        .returning();
      return row!;
    },

    async touchLogin(userId: string) {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    },

    async setName(userId: string, name: string) {
      await db
        .update(users)
        .set({ name: name.slice(0, 120) })
        .where(eq(users.id, userId));
    },

    async setTotpSecret(userId: string, encrypted: string | null) {
      await db
        .update(users)
        .set({ totpSecretEnc: encrypted, totpEnabledAt: null })
        .where(eq(users.id, userId));
    },

    async enableTotp(userId: string) {
      await db.update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, userId));
    },

    // --- orgs --------------------------------------------------------------------------------
    /** An org on pilot (trial) terms with an existing user as owner. Used by the seed and tests. */
    async createOrgWithOwner(input: { name: string; ownerId: string }) {
      return db.transaction(async (tx) => {
        const [org] = await tx
          .insert(orgs)
          .values({
            name: input.name.slice(0, 120),
            slug: slugify(input.name),
            status: 'trial',
            plan: 'trial',
            seats: TRIAL.maxSeats,
            trialEndsAt: new Date(Date.now() + TRIAL.days * 86_400_000),
            budgetMode: 'hard',
          })
          .returning();
        await tx
          .insert(memberships)
          .values({ orgId: org!.id, userId: input.ownerId, role: 'owner' });
        await tx.insert(adminEvents).values({
          orgId: org!.id,
          actorUserId: input.ownerId,
          action: 'org.created',
          targetId: org!.id,
        });
        return org!;
      });
    },

    async userOrgs(userId: string) {
      return db
        .select({
          id: orgs.id,
          name: orgs.name,
          slug: orgs.slug,
          status: orgs.status,
          plan: orgs.plan,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(orgs, eq(orgs.id, memberships.orgId))
        .where(eq(memberships.userId, userId))
        .orderBy(asc(memberships.createdAt));
    },

    async orgAdminEmails(orgId: string): Promise<string[]> {
      const rows = await db
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ['owner', 'admin'])));
      return rows.map((r) => r.email);
    },

    // --- magic links -------------------------------------------------------------------------
    async createMagicLink(email: string, next: string | null = null): Promise<string> {
      const token = randomToken();
      await db.insert(magicLinks).values({
        tokenHash: hashToken(token),
        email: normaliseEmail(email),
        next,
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
      });
      return token;
    },

    /** Single use: the first caller wins, later ones get null. */
    async consumeMagicLink(token: string) {
      const [row] = await db
        .update(magicLinks)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(magicLinks.tokenHash, hashToken(token)),
            isNull(magicLinks.usedAt),
            gt(magicLinks.expiresAt, new Date()),
          ),
        )
        .returning({ email: magicLinks.email, next: magicLinks.next });
      return row ?? null;
    },

    // --- sessions ----------------------------------------------------------------------------
    async createSession(userId: string, activeOrgId: string | null): Promise<string> {
      const token = randomToken();
      await db.insert(sessions).values({
        id: hashToken(token),
        userId,
        activeOrgId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      });
      return token;
    },

    async sessionByToken(token: string) {
      const [row] = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
      return row ?? null;
    },

    async setSessionOrg(token: string, orgId: string | null) {
      await db
        .update(sessions)
        .set({ activeOrgId: orgId })
        .where(eq(sessions.id, hashToken(token)));
    },

    async markSessionMfa(token: string) {
      await db
        .update(sessions)
        .set({ mfaVerifiedAt: new Date() })
        .where(eq(sessions.id, hashToken(token)));
    },

    async deleteSession(token: string) {
      await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
    },

    // --- invites -----------------------------------------------------------------------------
    async inviteByToken(token: string) {
      const [row] = await db
        .select({ invite: invites, orgName: orgs.name })
        .from(invites)
        .innerJoin(orgs, eq(orgs.id, invites.orgId))
        .where(
          and(
            eq(invites.tokenHash, hashToken(token)),
            isNull(invites.acceptedAt),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, new Date()),
          ),
        );
      return row ?? null;
    },

    async acceptInvite(token: string, user: { id: string; email: string }) {
      const found = await api.inviteByToken(token);
      if (!found) return { ok: false as const, reason: 'invalid' as const };
      if (found.invite.email !== normaliseEmail(user.email))
        return { ok: false as const, reason: 'email_mismatch' as const };
      const orgId = found.invite.orgId;
      await db.transaction(async (tx) => {
        await tx
          .insert(memberships)
          .values({ orgId, userId: user.id, role: found.invite.role })
          .onConflictDoNothing();
        await tx
          .update(invites)
          .set({ acceptedAt: new Date() })
          .where(eq(invites.id, found.invite.id));
        await tx
          .insert(adminEvents)
          .values({ orgId, actorUserId: user.id, action: 'member.joined', targetId: user.id });
      });
      return { ok: true as const, orgId, orgName: found.orgName };
    },

    // --- CLI device codes --------------------------------------------------------------------
    async createDeviceCode(clientName: string) {
      const deviceCode = randomToken();
      const code = userCode();
      const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);
      await db.insert(deviceCodes).values({
        deviceCodeHash: hashToken(deviceCode),
        userCode: code,
        clientName: clientName.replace(/[^\w .@-]/g, '').slice(0, 60) || 'device',
        expiresAt,
      });
      return { deviceCode, userCode: code, expiresAt };
    },

    async pendingDeviceCode(code: string) {
      const [row] = await db
        .select()
        .from(deviceCodes)
        .where(
          and(
            eq(deviceCodes.userCode, code.trim().toUpperCase()),
            isNull(deviceCodes.approvedAt),
            isNull(deviceCodes.deniedAt),
            gt(deviceCodes.expiresAt, new Date()),
          ),
        );
      return row ?? null;
    },

    async approveDeviceCode(code: string, userId: string, orgId: string) {
      const role = await forOrg(db, orgId).roleOf(userId);
      if (!role || role === 'billing') return false;
      const updated = await db
        .update(deviceCodes)
        .set({ approvedAt: new Date(), approvedBy: userId, orgId })
        .where(
          and(
            eq(deviceCodes.userCode, code.trim().toUpperCase()),
            isNull(deviceCodes.approvedAt),
            isNull(deviceCodes.deniedAt),
            gt(deviceCodes.expiresAt, new Date()),
          ),
        )
        .returning({ id: deviceCodes.id });
      return updated.length > 0;
    },

    async denyDeviceCode(code: string) {
      await db
        .update(deviceCodes)
        .set({ deniedAt: new Date() })
        .where(
          and(eq(deviceCodes.userCode, code.trim().toUpperCase()), isNull(deviceCodes.approvedAt)),
        );
    },

    /**
     * The CLI's poll. After approval, the first poll mints the key and returns it; the key is never
     * stored, so a second poll can only report `consumed`.
     */
    async pollDeviceCode(deviceCode: string, pepper: string) {
      const hash = hashToken(deviceCode);
      const [claimed] = await db
        .update(deviceCodes)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(deviceCodes.deviceCodeHash, hash),
            isNotNull(deviceCodes.approvedAt),
            isNull(deviceCodes.consumedAt),
            gt(deviceCodes.expiresAt, new Date(Date.now() - DEVICE_CODE_TTL_MS)),
          ),
        )
        .returning();
      if (claimed && claimed.orgId && claimed.approvedBy) {
        const tenant = forOrg(db, claimed.orgId);
        const { key, row } = await tenant.issueKey({
          userId: claimed.approvedBy,
          name: claimed.clientName,
          actor: claimed.approvedBy,
          pepper,
        });
        await db.update(deviceCodes).set({ keyId: row.id }).where(eq(deviceCodes.id, claimed.id));
        const org = await tenant.org();
        const user = await api.userById(claimed.approvedBy);
        return {
          status: 'approved' as const,
          key,
          orgName: org?.name ?? '',
          email: user?.email ?? '',
        };
      }
      const [row] = await db.select().from(deviceCodes).where(eq(deviceCodes.deviceCodeHash, hash));
      if (!row) return { status: 'invalid' as const };
      if (row.deniedAt) return { status: 'denied' as const };
      if (row.consumedAt) return { status: 'consumed' as const };
      if (row.expiresAt.getTime() <= Date.now()) return { status: 'expired' as const };
      return { status: 'pending' as const };
    },

    /** CLI logout: a key revokes itself, identified by its peppered hash. */
    async revokeKeyByHash(hash: string) {
      const [row] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
        .returning({ id: apiKeys.id, orgId: apiKeys.orgId, userId: apiKeys.userId });
      if (row) {
        await db.insert(adminEvents).values({
          orgId: row.orgId,
          actorUserId: row.userId,
          action: 'key.revoked_by_cli',
          targetId: row.id,
        });
      }
      return !!row;
    },

    // --- sales enquiries ---------------------------------------------------------------------
    async createEnquiry(input: {
      name: string;
      email: string;
      company: string;
      teamSize: string;
      planInterest: string;
      seats: number | null;
      message: string | null;
      orgId: string | null;
      source: 'contact' | 'dashboard';
    }) {
      const [row] = await db
        .insert(salesEnquiries)
        .values({ ...input, email: normaliseEmail(input.email) })
        .returning();
      return row!;
    },

    // --- notifications outbox ----------------------------------------------------------------
    async pendingNotifications(limit = 20) {
      return db
        .select()
        .from(notifications)
        .where(and(isNull(notifications.sentAt), sql`${notifications.attempts} < 5`))
        .orderBy(asc(notifications.createdAt))
        .limit(limit);
    },

    async markNotification(id: string, sent: boolean) {
      await db
        .update(notifications)
        .set(sent ? { sentAt: new Date() } : { attempts: sql`${notifications.attempts} + 1` })
        .where(eq(notifications.id, id));
    },

    // --- staff console -----------------------------------------------------------------------
    async staffOrgs(period: string) {
      return db
        .select({
          id: orgs.id,
          name: orgs.name,
          slug: orgs.slug,
          status: orgs.status,
          plan: orgs.plan,
          seats: orgs.seats,
          billingInterval: orgs.billingInterval,
          trialEndsAt: orgs.trialEndsAt,
          createdAt: orgs.createdAt,
          activatedAt: orgs.activatedAt,
          members: sql<number>`(select count(*)::int from ${memberships} where ${memberships.orgId} = ${orgs.id})`,
          monthTokens: sql<number>`(select coalesce(sum(${usageMonthly.tokens}), 0)::bigint from ${usageMonthly} where ${usageMonthly.orgId} = ${orgs.id} and ${usageMonthly.period} = ${period})`,
        })
        .from(orgs)
        .orderBy(desc(orgs.createdAt));
    },

    async staffEnquiries(limit = 200) {
      return db.select().from(salesEnquiries).orderBy(desc(salesEnquiries.createdAt)).limit(limit);
    },

    async staffSetEnquiryStatus(
      id: string,
      status: 'new' | 'contacted' | 'won' | 'lost',
      staffId: string,
    ) {
      await db
        .update(salesEnquiries)
        .set({ status, handledBy: staffId, handledAt: new Date() })
        .where(eq(salesEnquiries.id, id));
    },

    /**
     * Sales-led onboarding: staff create a customer's organisation on its agreed plan, or as a
     * time-limited pilot, and invite its first owner. Returns the one-time invitation token.
     */
    async staffCreateOrg(input: {
      name: string;
      ownerEmail: string;
      terms:
        | { kind: 'pilot'; days: number }
        | {
            kind: 'plan';
            plan: PaidPlanId;
            seats: number;
            interval: BillingInterval;
            startsOn: string;
            endsOn: string | null;
          };
      notes: string | null;
      staffId: string;
    }) {
      const token = randomToken();
      const pilot = input.terms.kind === 'pilot';
      const org = await db.transaction(async (tx) => {
        const t = input.terms;
        const [created] = await tx
          .insert(orgs)
          .values({
            name: input.name.slice(0, 120),
            slug: slugify(input.name),
            status: t.kind === 'pilot' ? 'trial' : 'active',
            plan: t.kind === 'pilot' ? 'trial' : t.plan,
            seats: t.kind === 'pilot' ? TRIAL.maxSeats : t.seats,
            billingInterval: t.kind === 'pilot' ? 'monthly' : t.interval,
            trialEndsAt: t.kind === 'pilot' ? new Date(Date.now() + t.days * 86_400_000) : null,
            budgetMode: t.kind === 'pilot' ? 'hard' : 'soft',
            activatedAt: t.kind === 'pilot' ? null : new Date(),
          })
          .returning();
        if (t.kind === 'plan') {
          await tx.insert(subscriptions).values({
            orgId: created!.id,
            plan: t.plan,
            seats: t.seats,
            interval: t.interval,
            startsOn: t.startsOn,
            endsOn: t.endsOn,
            notes: input.notes,
            createdBy: input.staffId,
          });
        }
        await tx.insert(invites).values({
          orgId: created!.id,
          email: normaliseEmail(input.ownerEmail),
          role: 'owner',
          tokenHash: hashToken(token),
          invitedBy: input.staffId,
          expiresAt: new Date(Date.now() + 14 * 86_400_000),
        });
        await tx.insert(adminEvents).values({
          orgId: created!.id,
          actorUserId: input.staffId,
          action: 'org.created_by_staff',
          targetId: created!.id,
          metadata: pilot
            ? { pilot_days: (t as { days: number }).days }
            : { plan: (t as { plan: string }).plan },
        });
        return created!;
      });
      return { org, inviteToken: token };
    },

    /** Contact-us billing: record the agreement and switch the org onto its paid plan. */
    async staffActivateOrg(input: {
      orgId: string;
      plan: PaidPlanId;
      seats: number;
      interval: BillingInterval;
      startsOn: string;
      endsOn: string | null;
      notes: string | null;
      staffId: string;
    }) {
      return db.transaction(async (tx) => {
        const [org] = await tx
          .update(orgs)
          .set({
            status: 'active',
            plan: input.plan,
            seats: input.seats,
            billingInterval: input.interval,
            activatedAt: new Date(),
            trialEndsAt: null,
            budgetMode: 'soft',
          })
          .where(eq(orgs.id, input.orgId))
          .returning();
        if (!org) return null;
        await tx.insert(subscriptions).values({
          orgId: input.orgId,
          plan: input.plan,
          seats: input.seats,
          interval: input.interval,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          notes: input.notes,
          createdBy: input.staffId,
        });
        await tx.insert(adminEvents).values({
          orgId: input.orgId,
          actorUserId: input.staffId,
          action: 'org.activated',
          targetId: input.orgId,
          metadata: { plan: input.plan, seats: input.seats, interval: input.interval },
        });
        return org;
      });
    },

    async staffSetStatus(orgId: string, status: 'active' | 'suspended', staffId: string) {
      await db.update(orgs).set({ status }).where(eq(orgs.id, orgId));
      await db.insert(adminEvents).values({
        orgId,
        actorUserId: staffId,
        action: `org.${status === 'active' ? 'reinstated' : 'suspended'}`,
        targetId: orgId,
      });
    },

    async staffExtendTrial(orgId: string, days: number, staffId: string) {
      await db
        .update(orgs)
        .set({
          trialEndsAt: sql`greatest(coalesce(${orgs.trialEndsAt}, now()), now()) + make_interval(days => ${days})`,
        })
        .where(and(eq(orgs.id, orgId), eq(orgs.status, 'trial')));
      await db.insert(adminEvents).values({
        orgId,
        actorUserId: staffId,
        action: 'trial.extended',
        targetId: orgId,
        metadata: { days },
      });
    },

    async subscriptionsFor(orgId: string) {
      return db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.orgId, orgId))
        .orderBy(desc(subscriptions.createdAt));
    },

    async playgroundUsage(days = 7) {
      return db
        .select()
        .from(playgroundUsageDaily)
        .where(sql`${playgroundUsageDaily.day} >= current_date - ${days}::int`)
        .orderBy(desc(playgroundUsageDaily.day));
    },

    async grantStaff(email: string, isStaff = true) {
      const [row] = await db
        .update(users)
        .set({ isStaff })
        .where(eq(users.email, normaliseEmail(email)))
        .returning({ id: users.id });
      return !!row;
    },
  };
  return api;
}

export type Accounts = ReturnType<typeof accounts>;

/** Seat limit for an org: trial seats on a trial, purchased seats otherwise. */
export function seatLimit(org: { plan: 'trial' | PaidPlanId; seats: number }): number {
  return maxSeatsFor(org.plan, org.seats);
}

export type { Role };
