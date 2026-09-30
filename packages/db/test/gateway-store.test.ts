import { createLogger } from '@sealcode/shared/logger';
import { hashApiKey } from '@sealcode/shared/node';
import { TRIAL, type UsageRecord } from '@sealcode/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGateway, DEFAULT_CONFIG } from '../../../apps/gateway/src/app';
import { createMockUpstream } from '../../../apps/gateway/mock/upstream';
import { accounts } from '../src/accounts';
import { createGatewayStore, resolveOrgBudget } from '../src/gateway-store';
import { notifications, orgs } from '../src/schema';
import { makeOrg, PEPPER, testDb } from './helpers';

const { db, sql, close } = testDb();
const store = createGatewayStore(sql);
let t: Awaited<ReturnType<typeof makeOrg>>;

beforeAll(async () => {
  t = await makeOrg(db, 'gw');
});
afterAll(close);

const record = (overrides: Partial<UsageRecord> & { tokens?: number } = {}): UsageRecord => ({
  requestId: `req_${Math.random().toString(16).slice(2)}`,
  orgId: t.org.id,
  userId: t.dev.id,
  keyId: t.devKey.row.id,
  endpoint: 'messages',
  modelAlias: 'sealcode-pro',
  upstreamModel: 'z-ai/glm-5.3',
  usage: {
    inputTokens: overrides.tokens ?? 100,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  status: 200,
  errorType: null,
  latencyMs: 10,
  ttfbMs: 5,
  receiptId: 'rcpt-x',
  stream: false,
  createdAt: new Date(),
  ...overrides,
});

describe('findKey', () => {
  it('resolves a trial key with the trial allowance as a cap', async () => {
    const ctx = await store.findKey(hashApiKey(t.devKey.key, PEPPER));
    expect(ctx).toMatchObject({
      keyId: t.devKey.row.id,
      orgId: t.org.id,
      userId: t.dev.id,
      revoked: false,
      orgStatus: 'trial',
      plan: 'trial',
      rateLimitRpm: TRIAL.rateLimitRpm,
      budgetMode: 'hard',
      orgBudgetTokens: TRIAL.pooledTokens,
      seatBudgetTokens: null,
    });
    expect(ctx!.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns null for unknown hashes', async () => {
    expect(await store.findKey('0'.repeat(64))).toBeNull();
  });

  it('applies seat budgets: the seat override beats the default', async () => {
    await t.tenant.setBudget({ scope: 'seat', monthlyTokens: 2_000, actor: t.owner.id });
    expect((await store.findKey(hashApiKey(t.ownerKey.key, PEPPER)))?.seatBudgetTokens).toBe(2_000);
    await t.tenant.setBudget({
      scope: 'seat',
      userId: t.dev.id,
      monthlyTokens: 500,
      actor: t.owner.id,
    });
    expect((await store.findKey(hashApiKey(t.devKey.key, PEPPER)))?.seatBudgetTokens).toBe(500);
    await t.tenant.setBudget({
      scope: 'seat',
      userId: t.dev.id,
      monthlyTokens: 800,
      actor: t.owner.id,
    });
    expect((await store.findKey(hashApiKey(t.devKey.key, PEPPER)))?.seatBudgetTokens).toBe(800);
    await t.tenant.setBudget({
      scope: 'seat',
      userId: t.dev.id,
      monthlyTokens: null,
      actor: t.owner.id,
    });
    await t.tenant.setBudget({ scope: 'seat', monthlyTokens: null, actor: t.owner.id });
    expect((await store.findKey(hashApiKey(t.devKey.key, PEPPER)))?.seatBudgetTokens).toBeNull();
  });

  it('never lets a trial budget exceed the trial allowance', () => {
    expect(resolveOrgBudget('trial', 6, 999_000_000)).toBe(TRIAL.pooledTokens);
    expect(resolveOrgBudget('trial', 6, 1_000)).toBe(1_000);
    expect(resolveOrgBudget('team', 5, null)).toBe(100_000_000);
    expect(resolveOrgBudget('enterprise', 50, null)).toBeNull();
  });

  it('treats keys of removed members as revoked', async () => {
    const other = await makeOrg(db, 'leaver');
    await other.tenant.removeMember(other.dev.id, other.owner.id);
    expect((await store.findKey(hashApiKey(other.devKey.key, PEPPER)))?.revoked).toBe(true);
  });
});

describe('recordUsage and budget alerts', () => {
  it('writes the audit row and the rollups', async () => {
    const org = await makeOrg(db, 'rollup');
    const r = record({
      orgId: org.org.id,
      userId: org.dev.id,
      keyId: org.devKey.row.id,
      tokens: 250,
    });
    await store.recordUsage(r);
    await store.recordUsage({ ...r, requestId: `${r.requestId}-2` });
    const period = r.createdAt.toISOString().slice(0, 7);
    expect(await store.getMonthUsage(org.org.id, org.dev.id, period)).toEqual({
      orgTokens: 500,
      seatTokens: 500,
    });
    expect(await store.getMonthUsage(org.org.id, org.owner.id, period)).toEqual({
      orgTokens: 500,
      seatTokens: 0,
    });
    const [day] = await org.tenant.usageDaily({ from: '2000-01-01', to: '2999-12-31' });
    expect(day).toMatchObject({ requests: 2, inputTokens: 500 });
  });

  it('raises each threshold alert once per period', async () => {
    const org = await makeOrg(db, 'alerts');
    await org.tenant.setBudget({ scope: 'org', monthlyTokens: 1_000, actor: org.owner.id });
    const base = { orgId: org.org.id, userId: org.dev.id, keyId: org.devKey.row.id };
    await store.recordUsage(record({ ...base, tokens: 400 }));
    await store.recordUsage(record({ ...base, tokens: 150 })); // 55%: 50
    await store.recordUsage(record({ ...base, tokens: 100 })); // 65%: nothing new
    await store.recordUsage(record({ ...base, tokens: 200 })); // 85%: 80
    await store.recordUsage(record({ ...base, tokens: 500 })); // 135%: 100
    await store.recordUsage(record({ ...base, tokens: 500 })); // nothing new
    const rows = await db.select().from(notifications).where(eq(notifications.orgId, org.org.id));
    expect(rows.map((r) => r.payload.threshold).sort()).toEqual([100, 50, 80]);
    expect(rows.every((r) => r.kind === 'budget_alert' && r.payload.scope === 'org')).toBe(true);
    // Payloads are metadata only.
    expect(Object.keys(rows[0]!.payload).sort()).toEqual([
      'budget',
      'period',
      'scope',
      'threshold',
      'used',
      'userId',
    ]);
  });

  it('counts playground tokens per day', async () => {
    await store.recordPlaygroundUsage('2026-10-01', 300);
    await store.recordPlaygroundUsage('2026-10-01', 200);
    expect(await store.playgroundTokensToday('2026-10-01')).toBe(500);
  });
});

describe('gateway on Postgres', () => {
  function gatewayFor(clock: { now: number }) {
    const mock = createMockUpstream();
    return createGateway({
      store,
      logger: createLogger({ component: 'gateway', sink: () => undefined }),
      config: {
        ...DEFAULT_CONFIG,
        upstreamBaseUrl: 'http://upstream.test',
        upstreamApiKey: 'mock-phala-key',
        keyPepper: PEPPER,
      },
      fetch: async (input, init) => mock.app.fetch(new Request(input as string, init)),
      now: () => clock.now,
    });
  }
  const call = (app: ReturnType<typeof gatewayFor>, key: string) =>
    app.request('/v1/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'sealcode-pro',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

  it('stops a revoked key within 5 seconds', async () => {
    const org = await makeOrg(db, 'revoke');
    const clock = { now: Date.now() };
    const app = gatewayFor(clock);
    expect((await call(app, org.devKey.key)).status).toBe(200);
    await org.tenant.revokeKey(org.devKey.row.id, org.owner.id);
    clock.now += 5_000;
    const res = await call(app, org.devKey.key);
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toContain('revoked');
  });

  it('writes a metadata-only audit row for each request', async () => {
    const org = await makeOrg(db, 'audit');
    const app = gatewayFor({ now: Date.now() });
    const res = await call(app, org.devKey.key);
    await res.text();
    await new Promise((r) => setTimeout(r, 100));
    const [row] = await org.tenant.audit();
    expect(row).toMatchObject({
      status: 200,
      modelAlias: 'sealcode-pro',
      keyName: 'dev-laptop',
      email: org.dev.email,
    });
    expect(row!.receiptId).toMatch(/^rcpt-/);
  });

  it('hard-stops an exhausted trial with a message pointing to sales', async () => {
    const org = await makeOrg(db, 'broke');
    await org.tenant.setBudget({ scope: 'org', monthlyTokens: 50, actor: org.owner.id });
    await store.recordUsage(
      record({ orgId: org.org.id, userId: org.dev.id, keyId: org.devKey.row.id, tokens: 60 }),
    );
    const res = await call(gatewayFor({ now: Date.now() }), org.devKey.key);
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/trial has used its 50 token allowance/);
  });

  it('refuses keys once the trial has ended', async () => {
    const org = await makeOrg(db, 'expired');
    await db
      .update(orgs)
      .set({ trialEndsAt: new Date(Date.now() - 1_000) })
      .where(eq(orgs.id, org.org.id));
    expect((await call(gatewayFor({ now: Date.now() }), org.devKey.key)).status).toBe(403);
  });

  it('lifts trial limits when staff activate the org', async () => {
    const org = await makeOrg(db, 'activated');
    const staff = await accounts(db).upsertUser('staff@sealcode.test');
    await accounts(db).staffActivateOrg({
      orgId: org.org.id,
      plan: 'team',
      seats: 10,
      interval: 'monthly',
      startsOn: '2026-10-01',
      endsOn: null,
      notes: null,
      staffId: staff.id,
    });
    const ctx = await store.findKey(hashApiKey(org.devKey.key, PEPPER));
    expect(ctx).toMatchObject({
      orgStatus: 'active',
      plan: 'team',
      budgetMode: 'soft',
      orgBudgetTokens: 200_000_000,
      rateLimitRpm: 120,
    });
    expect(await accounts(db).subscriptionsFor(org.org.id)).toHaveLength(1);
  });
});
