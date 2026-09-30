import { PLAYGROUND } from '@sealcode/shared';
import { describe, expect, it } from 'vitest';
import { lastUpstream, PROMPT, setup, SITE_ORIGIN } from './helpers';

const body = (extra: Record<string, unknown> = {}) => ({
  model: 'sealcode-pro',
  max_tokens: 50_000,
  stream: true,
  messages: [{ role: 'user', content: PROMPT }],
  ...extra,
});

function call(t: ReturnType<typeof setup>, token: string, b: unknown = body()) {
  return t.post('/v1/messages', b, {
    'x-api-key': token,
    'anthropic-version': '2023-06-01',
    origin: SITE_ORIGIN,
  });
}

describe('playground tokens', () => {
  it('streams a reply and caps output tokens', async () => {
    const t = setup();
    const res = await call(t, t.playgroundToken());
    expect(res.status).toBe(200);
    await res.text();
    expect(lastUpstream(t.mock).body.max_tokens).toBe(PLAYGROUND.maxOutputTokens);
    expect(lastUpstream(t.mock).body.provider).toEqual({ aci_verified: true, zdr: true });
  });

  it('records playground usage separately from any org', async () => {
    const t = setup();
    await (await call(t, t.playgroundToken())).text();
    expect(t.store.records).toHaveLength(0);
    expect([...t.store.playground.values()][0]).toBeGreaterThan(0);
  });

  it('refuses tools', async () => {
    const t = setup();
    const res = await call(
      t,
      t.playgroundToken(),
      body({ tools: [{ name: 'Bash', input_schema: { type: 'object' } }] }),
    );
    expect(res.status).toBe(400);
    expect(t.mock.requests).toHaveLength(0);
  });

  it('refuses expired and forged tokens', async () => {
    const t = setup();
    const token = t.playgroundToken(60);
    t.advance(61_000);
    expect((await call(t, token)).status).toBe(401);
    expect((await call(t, `${token.slice(0, -4)}AAAA`)).status).toBe(401);
  });

  it('limits requests per token', async () => {
    const t = setup();
    const token = t.playgroundToken();
    for (let i = 0; i < PLAYGROUND.maxRequestsPerToken; i++) {
      const res = await call(t, token, body({ stream: false }));
      expect(res.status).toBe(200);
      t.advance(15_000);
    }
    const res = await call(t, token);
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toContain('free trial');
  });

  it('stops for the day at the global token cap', async () => {
    const t = setup();
    t.store.playground.set(new Date(t.now()).toISOString().slice(0, 10), PLAYGROUND.dailyTokenCap);
    const res = await call(t, t.playgroundToken());
    expect(res.status).toBe(429);
    expect(t.mock.requests).toHaveLength(0);
  });

  it('caps request size', async () => {
    const t = setup();
    const res = await call(
      t,
      t.playgroundToken(),
      body({ messages: [{ role: 'user', content: PROMPT.repeat(1_000) }] }),
    );
    expect(res.status).toBe(413);
  });
});

describe('CORS', () => {
  it('allows preflight from the marketing site only', async () => {
    const t = setup();
    const ok = await t.app.request('/v1/messages', {
      method: 'OPTIONS',
      headers: { origin: SITE_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE_ORIGIN);
    expect(ok.headers.get('access-control-allow-headers')).toContain('x-api-key');

    const evil = await t.app.request('/v1/messages', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    expect(evil.status).toBe(403);
  });

  it('exposes the receipt header to the site', async () => {
    const t = setup();
    const res = await call(t, t.playgroundToken());
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE_ORIGIN);
    expect(res.headers.get('access-control-expose-headers')).toContain('x-receipt-id');
    expect(res.headers.get('x-receipt-id')).toMatch(/^rcpt-/);
    await res.text();
  });
});
