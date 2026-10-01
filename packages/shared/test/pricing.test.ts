import { describe, expect, it } from 'vitest';
import {
  blendedCostPerMTok,
  formatTokens,
  monthlyStatement,
  roundCents,
  upstreamCostUsd,
} from '../src';

const brief = { inputShare: 0.95 };

describe('unit economics from the brief', () => {
  it('blends GLM 5.3 to $1.55/M uncached and $0.79/M with 70% cache reads', () => {
    expect(
      roundCents(blendedCostPerMTok('sealcode-pro', { ...brief, cachedShareOfInput: 0 })),
    ).toBe(1.55);
    expect(
      roundCents(blendedCostPerMTok('sealcode-pro', { ...brief, cachedShareOfInput: 0.7 })),
    ).toBe(0.79);
  });

  it('reproduces the per-seat model cost table', () => {
    const uncached = blendedCostPerMTok('sealcode-pro', { ...brief, cachedShareOfInput: 0 });
    const cached = blendedCostPerMTok('sealcode-pro', { ...brief, cachedShareOfInput: 0.7 });
    expect(roundCents(uncached * 20)).toBe(31.0);
    expect(roundCents(cached * 20)).toBe(15.84);
    expect(roundCents(uncached * 40)).toBe(62.0);
    expect(roundCents(cached * 40)).toBe(31.68);
  });

  it('prices a request against the upstream list', () => {
    const cost = upstreamCostUsd('sealcode-pro', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 0,
    });
    expect(roundCents(cost)).toBe(roundCents(1.4 + 4.4 + 0.26));
  });
});

describe('monthlyStatement', () => {
  it('charges seats only while inside the pooled allowance', () => {
    const s = monthlyStatement({
      plan: 'team',
      seats: 5,
      interval: 'monthly',
      usage: {
        inputTokens: 50_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
    expect(s.allowanceTokens).toBe(100_000_000);
    expect(s.overageTokens).toBe(0);
    expect(s.totalUsd).toBe(295);
  });

  it('bills overage on the share above the allowance at the month mix', () => {
    const s = monthlyStatement({
      plan: 'team',
      seats: 3,
      interval: 'monthly',
      usage: {
        inputTokens: 76_000_000,
        outputTokens: 4_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
    // 80M used, 60M allowance, so a quarter of the month's list overage.
    expect(s.overageTokens).toBe(20_000_000);
    expect(s.overageUsd).toBe(roundCents((76 * 2.5 + 4 * 8) / 4));
    expect(s.totalUsd).toBe(roundCents(177 + s.overageUsd));
  });

  it('never bills a trial', () => {
    const s = monthlyStatement({
      plan: 'trial',
      seats: 5,
      interval: 'monthly',
      usage: { inputTokens: 90_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    expect(s.totalUsd).toBe(0);
  });
});

describe('formatTokens', () => {
  it('uses K, M and B', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(1_500)).toBe('1.5K');
    expect(formatTokens(20_000_000)).toBe('20M');
    expect(formatTokens(1_000_000_000)).toBe('1B');
    expect(formatTokens(2_500_000_000)).toBe('2.5B');
  });
});

describe('custom pricing', () => {
  it('treats Enterprise as priced per agreement', async () => {
    const { isCustomPriced } = await import('../src');
    expect(isCustomPriced('enterprise')).toBe(true);
    expect(isCustomPriced('team')).toBe(false);
    expect(isCustomPriced('trial')).toBe(false);
  });
});
