/**
 * Milestone 4 (contact-us billing): an org is activated by staff, adds usage past its pooled
 * allowance, and the monthly statement reproduces from usage_events to the cent.
 */
import { monthlyStatement, OVERAGE_PER_MTOK, roundCents, type UsageRecord } from '@sealcode/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { accounts } from '../src/accounts';
import { createGatewayStore } from '../src/gateway-store';
import { makeOrg, testDb } from './helpers';

const { db, sql, close } = testDb();
afterAll(close);

describe('manual billing statement', () => {
  it('matches usage_events to the cent after activation and overage', async () => {
    const t = await makeOrg(db, 'invoice');
    const staff = await accounts(db).upsertUser('billing-staff@sealcode.test');
    await accounts(db).staffActivateOrg({
      orgId: t.org.id,
      plan: 'team',
      seats: 3,
      interval: 'monthly',
      startsOn: '2026-10-01',
      endsOn: null,
      notes: 'PO-1',
      staffId: staff.id,
    });
    const store = createGatewayStore(sql);
    const now = new Date();
    const rows: UsageRecord[] = [
      [41_234_567, 1_234_567, 9_876_543, 0],
      [12_345_678, 876_543, 3_456_789, 123_456],
      [7_654_321, 345_678, 0, 0],
    ].map(([input, output, cached, write], i) => ({
      requestId: `req_invoice_${i}_${Date.now()}`,
      orgId: t.org.id,
      userId: t.dev.id,
      keyId: t.devKey.row.id,
      endpoint: 'messages',
      modelAlias: 'sealcode-pro',
      upstreamModel: 'z-ai/glm-5.3',
      usage: {
        inputTokens: input!,
        outputTokens: output!,
        cacheReadTokens: cached!,
        cacheWriteTokens: write!,
      },
      status: 200,
      errorType: null,
      latencyMs: 100,
      ttfbMs: 50,
      receiptId: null,
      stream: true,
      createdAt: now,
    }));
    for (const r of rows) await store.recordUsage(r);

    const period = now.toISOString().slice(0, 7);
    const totals = await t.tenant.monthTotals(period);
    const org = (await t.tenant.org())!;
    const st = monthlyStatement({
      plan: org.plan,
      seats: org.seats,
      interval: org.billingInterval,
      usage: totals,
    });

    // Independent computation straight from the raw rows.
    const sum = (f: (r: UsageRecord) => number) => rows.reduce((n, r) => n + f(r), 0);
    const input = sum((r) => r.usage.inputTokens + r.usage.cacheWriteTokens);
    const cached = sum((r) => r.usage.cacheReadTokens);
    const output = sum((r) => r.usage.outputTokens);
    const used = input + cached + output;
    const allowance = 3 * 20_000_000;
    const expectedOverage = roundCents(
      ((input * OVERAGE_PER_MTOK.input +
        cached * OVERAGE_PER_MTOK.cachedInput +
        output * OVERAGE_PER_MTOK.output) /
        1e6) *
        ((used - allowance) / used),
    );

    expect(st.usedTokens).toBe(used);
    expect(st.overageTokens).toBe(used - allowance);
    expect(st.overageUsd).toBe(expectedOverage);
    expect(st.seatFeesUsd).toBe(177);
    expect(st.totalUsd).toBe(roundCents(177 + expectedOverage));
  });
});
