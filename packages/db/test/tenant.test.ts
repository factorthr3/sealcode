/**
 * Tenant isolation: org A's repository must never read or change org B's data, including when
 * handed org B's IDs. The final test fails if a repository function is added without being
 * exercised here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGatewayStore } from '../src/gateway-store';
import { forOrg } from '../src/tenant';
import { accounts } from '../src/accounts';
import { makeOrg, testDb, uniqueEmail } from './helpers';

const { db, sql, close } = testDb();
const store = createGatewayStore(sql);
let a: Awaited<ReturnType<typeof makeOrg>>;
let b: Awaited<ReturnType<typeof makeOrg>>;
const exercised = new Set<string>();
const use = <K extends keyof ReturnType<typeof forOrg>>(name: K) => {
  exercised.add(name);
  return a.tenant[name];
};

function usage(org: typeof a, requestId: string, receiptId: string) {
  return store.recordUsage({
    requestId,
    orgId: org.org.id,
    userId: org.dev.id,
    keyId: org.devKey.row.id,
    endpoint: 'messages',
    modelAlias: 'sealcode-pro',
    upstreamModel: 'z-ai/glm-5.3',
    usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 0 },
    status: 200,
    errorType: null,
    latencyMs: 40,
    ttfbMs: 20,
    receiptId,
    stream: true,
    createdAt: new Date(),
  });
}

beforeAll(async () => {
  a = await makeOrg(db, 'alpha');
  b = await makeOrg(db, 'bravo');
  await usage(a, `req_a_${Date.now()}`, `rcpt-a-${Date.now()}`);
  await usage(b, `req_b_${Date.now()}`, `rcpt-b-${Date.now()}`);
  await b.tenant.createInvite({
    email: uniqueEmail('bravo-pending'),
    role: 'developer',
    invitedBy: b.owner.id,
  });
  await b.tenant.setBudget({ scope: 'org', monthlyTokens: 5_000, actor: b.owner.id });
  await b.tenant.setBudget({
    scope: 'seat',
    userId: b.dev.id,
    monthlyTokens: 1_000,
    actor: b.owner.id,
  });
});

afterAll(close);

const period = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);
const bIds = () => [b.org.id, b.owner.id, b.dev.id, b.ownerKey.row.id, b.devKey.row.id];

describe('tenant isolation', () => {
  it('reads only its own org', async () => {
    expect((await use('org')())?.id).toBe(a.org.id);
    const members = await use('members')();
    expect(members.map((m) => m.userId).sort()).toEqual([a.owner.id, a.dev.id].sort());
    expect(await use('roleOf')(b.owner.id)).toBeNull();
    expect(await use('seatsInUse')()).toBe(2);
    expect(await use('invites')()).toEqual([]);
    const keys = await use('keys')();
    expect(keys.map((k) => k.id).sort()).toEqual([a.ownerKey.row.id, a.devKey.row.id].sort());
    expect(await use('keys')({ userId: b.dev.id })).toEqual([]);
  });

  it('reads only its own usage, audit log and receipts', async () => {
    const daily = await use('usageDaily')({ from: today, to: today });
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.every((r) => r.userId === a.dev.id)).toBe(true);
    expect((await use('monthTotals')(period)).requests).toBe(1);
    const seats = await use('seatUsage')(period);
    expect(seats.map((s) => s.userId)).toEqual([a.dev.id]);
    const audit = await use('audit')({ limit: 50 });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.keyName).toBe('dev-laptop');
    expect(await use('audit')({ userId: b.dev.id })).toEqual([]);
    expect(await use('audit')({ keyId: b.devKey.row.id })).toEqual([]);
    const [bAudit] = await b.tenant.audit();
    expect(await use('ownsReceipt')(bAudit!.receiptId!)).toBe(false);
    expect(await a.tenant.ownsReceipt(audit[0]!.receiptId!)).toBe(true);
  });

  it('reads only its own budgets and admin events', async () => {
    expect(await use('budgets')()).toEqual([]);
    const events = await use('adminEvents')();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(bIds()).not.toContain(e.targetId);
  });

  it('cannot change another org through its IDs', async () => {
    expect(await use('revokeKey')(b.devKey.row.id, a.owner.id)).toBe(false);
    expect(await use('setRole')(b.dev.id, 'admin', a.owner.id)).toBe(false);
    expect(await use('removeMember')(b.dev.id, a.owner.id)).toBe(false);
    const [bInvite] = await b.tenant.invites();
    expect(await use('revokeInvite')(bInvite!.id, a.owner.id)).toBe(false);
    await expect(
      use('issueKey')({ userId: b.dev.id, name: 'x', actor: a.owner.id, pepper: 'p'.repeat(32) }),
    ).rejects.toThrow('not_a_seat');
    await expect(
      use('setBudget')({ scope: 'seat', userId: b.dev.id, monthlyTokens: 1, actor: a.owner.id }),
    ).rejects.toThrow('not_a_member');

    // Org B is untouched.
    expect((await b.tenant.keys()).every((k) => k.revokedAt === null)).toBe(true);
    expect(await b.tenant.roleOf(b.dev.id)).toBe('developer');
    expect(await b.tenant.invites()).toHaveLength(1);
    expect(await b.tenant.budgets()).toHaveLength(2);
  });

  it('scopes its own writes to itself', async () => {
    await use('rename')('Alpha Holdings', a.owner.id);
    expect((await b.tenant.org())?.name).toBe('bravo Ltd');
    await use('setBudgetMode')('hard', a.owner.id);
    expect((await b.tenant.org())?.budgetMode).toBe('hard'); // trials start in hard mode
    await use('logAdmin')(a.owner.id, 'test.event', null);
    expect((await b.tenant.adminEvents()).some((e) => e.action === 'test.event')).toBe(false);
    const { token } = await use('createInvite')({
      email: uniqueEmail('alpha-x'),
      role: 'developer',
      invitedBy: a.owner.id,
    });
    expect(token.length).toBeGreaterThan(20);
    expect(await b.tenant.invites()).toHaveLength(1);
  });

  it('covers every repository function', () => {
    const all = Object.keys(forOrg(db, a.org.id)).filter(
      (k) => typeof forOrg(db, a.org.id)[k as never] === 'function',
    );
    expect(all.filter((k) => !exercised.has(k))).toEqual([]);
  });
});

describe('account-level lookups respect membership', () => {
  it('lists only orgs the user belongs to', async () => {
    const orgs = await accounts(db).userOrgs(a.dev.id);
    expect(orgs.map((o) => o.id)).toEqual([a.org.id]);
  });

  it('refuses a device approval for an org the user is not in', async () => {
    const acc = accounts(db);
    const { userCode } = await acc.createDeviceCode('laptop');
    expect(await acc.approveDeviceCode(userCode, a.dev.id, b.org.id)).toBe(false);
  });
});
