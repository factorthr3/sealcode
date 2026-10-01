import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { UsageRecord } from '@sealcode/shared';
import { createGatewayStore } from '../src/gateway-store';
import { notifications } from '../src/schema';
import { makeOrg, testDb } from './helpers';

const { db, sql, close } = testDb();
const store = createGatewayStore(sql);
afterAll(close);

function usage(org: Awaited<ReturnType<typeof makeOrg>>, when: Date, tokens: number): UsageRecord {
  return {
    requestId: `req_trial_${Math.random().toString(16).slice(2)}`,
    orgId: org.org.id,
    userId: org.dev.id,
    keyId: org.devKey.row.id,
    endpoint: 'messages',
    modelAlias: 'sealcode-pro',
    upstreamModel: 'z-ai/glm-5.3',
    usage: { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    status: 200,
    errorType: null,
    latencyMs: 1,
    ttfbMs: 1,
    receiptId: null,
    stream: false,
    createdAt: when,
  };
}

const SEPT = new Date(Date.UTC(2026, 8, 29));
const OCT = new Date(Date.UTC(2026, 9, 3));

describe('trial usage spans calendar months', () => {
  it('sums usage across months for the trial allowance', async () => {
    const org = await makeOrg(db, 'span');
    await store.recordUsage(usage(org, SEPT, 700));
    await store.recordUsage(usage(org, OCT, 500));
    expect(await store.getTrialUsage(org.org.id, org.dev.id)).toEqual({
      orgTokens: 1_200,
      seatTokens: 1_200,
    });
    expect(await store.getMonthUsage(org.org.id, org.dev.id, '2026-10')).toEqual({
      orgTokens: 500,
      seatTokens: 500,
    });
    expect(await org.tenant.trialUsage()).toBe(1_200);
  });

  it('raises each trial alert once for the whole trial, not again in the new month', async () => {
    const org = await makeOrg(db, 'trialalerts');
    await org.tenant.setBudget({ scope: 'org', monthlyTokens: 1_000, actor: org.owner.id });
    await store.recordUsage(usage(org, SEPT, 600)); // 60%: 50
    await store.recordUsage(usage(org, OCT, 300)); // 90%: 80 (would be 30% of October alone)
    await store.recordUsage(usage(org, OCT, 200)); // 110%: 100
    await store.recordUsage(usage(org, OCT, 100)); // nothing new
    const rows = await db.select().from(notifications).where(eq(notifications.orgId, org.org.id));
    expect(rows.map((r) => r.payload.threshold).sort()).toEqual([100, 50, 80]);
    expect(rows.every((r) => r.payload.period === 'trial')).toBe(true);
  });
});
