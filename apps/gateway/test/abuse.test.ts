/**
 * Rate-limit and abuse behaviour under concurrency: limits must hold when requests arrive
 * together, and floods of bad credentials must not turn into floods of database queries.
 */
import { PLAYGROUND } from '@sealcode/shared';
import { describe, expect, it } from 'vitest';
import { messageBody, setup, SITE_ORIGIN } from './helpers';

describe('abuse resistance', () => {
  it('admits exactly the per-key allowance from a concurrent burst', async () => {
    const t = setup({ ctx: { rateLimitRpm: 10 } });
    const results = await Promise.all(Array.from({ length: 50 }, () => t.messages(messageBody())));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(40);
    expect(t.mock.requests).toHaveLength(10);
  });

  it('caches unknown keys, so a flood of bad credentials barely touches the store', async () => {
    const t = setup();
    let lookups = 0;
    const original = t.store.findKey.bind(t.store);
    t.store.findKey = async (hash) => {
      lookups++;
      return original(hash);
    };
    const forged = `sc_live_${'Z'.repeat(43)}`;
    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        t.post('/v1/messages', messageBody(), { authorization: `Bearer ${forged}` }),
      ),
    );
    expect(results.every((r) => r.status === 401)).toBe(true);
    // Concurrent lookups for one key are coalesced into a single query, then cached.
    expect(lookups).toBe(1);
    const before = lookups;
    await t.post('/v1/messages', messageBody(), { authorization: `Bearer ${forged}` });
    expect(lookups).toBe(before);
  });

  it('rejects malformed credentials without any lookup', async () => {
    const t = setup();
    let lookups = 0;
    t.store.findKey = async () => {
      lookups++;
      return null;
    };
    for (const bad of ['x'.repeat(10_000), 'sc_live_short', "sc_live_' OR 1=1 --"]) {
      expect(
        (await t.post('/v1/messages', messageBody(), { authorization: `Bearer ${bad}` })).status,
      ).toBe(401);
    }
    expect(lookups).toBe(0);
  });

  it('holds the playground request cap under parallel reuse of one token', async () => {
    const t = setup();
    const token = t.playgroundToken();
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        t.post(
          '/v1/messages',
          { ...messageBody(), stream: false },
          { 'x-api-key': token, origin: SITE_ORIGIN },
        ),
      ),
    );
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBeLessThanOrEqual(PLAYGROUND.maxRequestsPerToken);
    expect(ok).toBeLessThanOrEqual(PLAYGROUND.requestsPerMinute);
    expect(t.mock.requests.length).toBe(ok);
  });

  it('never lets a budget-exhausted org reach the upstream, even in a burst', async () => {
    const t = setup({ ctx: { budgetMode: 'hard', orgBudgetTokens: 0 } });
    const results = await Promise.all(Array.from({ length: 25 }, () => t.messages(messageBody())));
    expect(results.every((r) => r.status === 429)).toBe(true);
    expect(t.mock.requests).toHaveLength(0);
  });
});
