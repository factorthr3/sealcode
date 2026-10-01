import { describe, expect, it } from 'vitest';
import type { UsageRecord } from '@sealcode/shared';
import { messageBody, setup } from './helpers';

function usageAt(when: Date, tokens: number): UsageRecord {
  return {
    requestId: `req_${when.getTime()}_${tokens}`,
    orgId: 'org_1',
    userId: 'user_1',
    keyId: 'key_1',
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

// The helper's clock is 15 Oct 2026; these trials started in September.
const SEPT = new Date(Date.UTC(2026, 8, 28));
const OCT = new Date(Date.UTC(2026, 9, 2));

describe('trial allowance', () => {
  it('covers the whole trial, so a new month does not reset it', async () => {
    const t = setup({
      ctx: {
        plan: 'trial',
        orgStatus: 'trial',
        budgetMode: 'hard',
        orgBudgetTokens: 20_000,
        trialEndsAt: new Date(Date.UTC(2026, 9, 20)),
      },
    });
    t.store.records.push(usageAt(SEPT, 15_000), usageAt(OCT, 6_000));
    const res = await t.messages(messageBody());
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toContain('pilot has used its 20K token allowance');
  });

  it('still allows a trial under its allowance across both months', async () => {
    const t = setup({
      ctx: {
        plan: 'trial',
        orgStatus: 'trial',
        budgetMode: 'hard',
        orgBudgetTokens: 20_000,
        trialEndsAt: new Date(Date.UTC(2026, 9, 20)),
      },
    });
    t.store.records.push(usageAt(SEPT, 12_000), usageAt(OCT, 6_000));
    expect((await t.messages(messageBody())).status).toBe(200);
  });

  it('keeps monthly budgets for paid plans', async () => {
    const t = setup({
      ctx: { plan: 'team', orgStatus: 'active', budgetMode: 'hard', orgBudgetTokens: 20_000 },
    });
    t.store.records.push(usageAt(SEPT, 15_000), usageAt(OCT, 6_000));
    expect((await t.messages(messageBody())).status).toBe(200);
  });

  it('words trial seat budgets without a monthly reset', async () => {
    const t = setup({
      ctx: {
        plan: 'trial',
        orgStatus: 'trial',
        budgetMode: 'hard',
        orgBudgetTokens: null,
        seatBudgetTokens: 5_000,
        trialEndsAt: new Date(Date.UTC(2026, 9, 20)),
      },
    });
    t.store.records.push(usageAt(SEPT, 5_000));
    const res = await t.messages(messageBody());
    expect(res.status).toBe(429);
    const message = (await res.json()).error.message as string;
    expect(message).toContain('for this pilot');
    expect(message).not.toContain('resets');
  });
});
