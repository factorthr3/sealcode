import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixture, lastUpstream, messageBody, PROMPT, setup } from './helpers';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const readFixture = (name: string) => readFileSync(new URL(`${name}.sse`, FIXTURES), 'utf8');

describe('POST /v1/messages: authentication', () => {
  it('accepts the key as a bearer token', async () => {
    const t = setup();
    const res = await t.messages(messageBody());
    expect(res.status).toBe(200);
  });

  it('accepts the key in x-api-key', async () => {
    const t = setup();
    const res = await t.post('/v1/messages', messageBody(), {
      'x-api-key': t.key,
      'anthropic-version': '2023-06-01',
    });
    expect(res.status).toBe(200);
  });

  it('prefers the Sealcode key when both headers are set', async () => {
    const t = setup();
    const res = await t.post('/v1/messages', messageBody(), {
      'x-api-key': 'sk-ant-stale',
      authorization: `Bearer ${t.key}`,
    });
    expect(res.status).toBe(200);
  });

  it('returns an Anthropic 401 without a key', async () => {
    const t = setup();
    const res = await t.post('/v1/messages', messageBody());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ type: 'error', error: { type: 'authentication_error' } });
    expect(body.request_id).toMatch(/^req_/);
    expect(t.mock.requests).toHaveLength(0);
  });

  it('rejects malformed and unknown keys', async () => {
    const t = setup();
    for (const key of ['sk-ant-api03-xyz', `sc_live_${'A'.repeat(43)}`]) {
      const res = await t.post('/v1/messages', messageBody(), { authorization: `Bearer ${key}` });
      expect(res.status).toBe(401);
    }
  });

  it('rejects revoked keys with a clear message', async () => {
    const t = setup({ ctx: { revoked: true } });
    const res = await t.messages(messageBody());
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toContain('revoked');
  });

  it('stops honouring a revoked key within 5 seconds', async () => {
    const t = setup();
    expect((await t.messages(messageBody())).status).toBe(200);
    for (const ctx of t.store.keys.values()) ctx.revoked = true;
    t.advance(1_000);
    // Still cached for up to keyCacheMs (3s)...
    expect((await t.messages(messageBody())).status).toBe(200);
    t.advance(2_500);
    expect((await t.messages(messageBody())).status).toBe(401);
  });
});

describe('POST /v1/messages: routing', () => {
  it.each([
    ['sealcode-pro', 'z-ai/glm-5.3'],
    ['sealcode-fast', 'z-ai/glm-5.3-flash'],
    ['claude-opus-4-8', 'z-ai/glm-5.3'],
    ['claude-sonnet-4-6[1m]', 'z-ai/glm-5.3'],
    ['claude-haiku-4-5-20251001', 'z-ai/glm-5.3-flash'],
  ])('maps %s to %s', async (model, upstream) => {
    const t = setup();
    await t.messages(messageBody({ model }));
    expect(lastUpstream(t.mock).body.model).toBe(upstream);
  });

  it('always requires a TEE route and zero retention, whatever the client sends', async () => {
    const t = setup();
    await t.messages(
      messageBody({
        provider: { aci_verified: false, zdr: false, allow_fallbacks: true, order: ['openai'] },
      }),
    );
    expect(lastUpstream(t.mock).body.provider).toEqual({ aci_verified: true, zdr: true });
  });

  it('forwards anthropic-* headers verbatim and nothing identifying', async () => {
    const t = setup();
    await t.messages(messageBody(), {
      'anthropic-beta': 'context-1m-2025-08-07,interleaved-thinking-2025-05-14',
      'x-claude-code-session-id': 'sess-123',
      cookie: 'a=b',
    });
    const { headers } = lastUpstream(t.mock);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-beta']).toBe('context-1m-2025-08-07,interleaved-thinking-2025-05-14');
    expect(headers['x-claude-code-session-id']).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
  });

  it('forwards every other body field unchanged and in order', async () => {
    const t = setup();
    const sent = messageBody({
      model: 'claude-sonnet-4-6',
      thinking: { type: 'adaptive' },
      context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] },
      metadata: { user_id: 'u' },
      temperature: 0.2,
    });
    await t.messages(sent);
    const { model: _m, provider: _p, ...forwarded } = lastUpstream(t.mock).body;
    const { model: _sm, ...expected } = sent;
    expect(JSON.stringify(forwarded)).toBe(JSON.stringify(expected));
  });

  it('returns 404 for an unknown model without calling upstream', async () => {
    const t = setup();
    const res = await t.messages(messageBody({ model: 'gpt-5' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ type: 'error', error: { type: 'not_found_error' } });
    expect(t.mock.requests).toHaveLength(0);
  });

  it('returns 400 for bodies that are not JSON objects', async () => {
    const t = setup();
    expect((await t.messages(`{"messages": "${PROMPT}`)).status).toBe(400);
    expect((await t.messages([1, 2])).status).toBe(400);
  });

  it('returns 413 for oversized bodies', async () => {
    const t = setup({ config: { maxBodyBytes: 1024 } });
    const res = await t.messages(
      messageBody({ messages: [{ role: 'user', content: PROMPT.repeat(40) }] }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.type).toBe('request_too_large');
  });
});

describe('POST /v1/messages: streaming passthrough', () => {
  it.each(['text_stream', 'tool_use_stream'])(
    'relays the recorded %s fixture byte for byte, apart from the model name',
    async (name) => {
      const t = setup();
      const res = await t.messages(
        messageBody({ stream: true, messages: [{ role: 'user', content: fixture(name) }] }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const expected = readFixture(name).replace(
        '"model":"z-ai/glm-5.3"',
        '"model":"sealcode-pro"',
      );
      expect(await res.text()).toBe(expected);
    },
  );

  it('leaves "model" mentions inside content alone', async () => {
    const t = setup();
    const res = await t.messages(
      messageBody({ stream: true, messages: [{ role: 'user', content: fixture('text_stream') }] }),
    );
    expect(await res.text()).toContain('The \\"model\\" field says z-ai/glm-5.3 here.');
  });

  it('records usage, cache reads and the receipt ID when the stream ends', async () => {
    const t = setup();
    const res = await t.messages(
      messageBody({
        stream: true,
        messages: [{ role: 'user', content: fixture('tool_use_stream') }],
      }),
    );
    const receipt = res.headers.get('x-receipt-id');
    await res.text();
    const rec = t.store.records.at(-1)!;
    expect(rec).toMatchObject({
      orgId: 'org_1',
      keyId: 'key_1',
      modelAlias: 'sealcode-pro',
      upstreamModel: 'z-ai/glm-5.3',
      status: 200,
      stream: true,
      receiptId: receipt,
      usage: { inputTokens: 472, outputTokens: 89, cacheReadTokens: 1800, cacheWriteTokens: 0 },
    });
    expect(receipt).toMatch(/^rcpt-/);
    expect(res.headers.get('x-sealcode-request-id')).toBe(rec.requestId);
  });

  it('streams generated tool calls in Anthropic event order', async () => {
    const t = setup();
    const res = await t.messages(
      messageBody({
        stream: true,
        tools: [
          {
            name: 'Read',
            input_schema: {
              type: 'object',
              properties: { file_path: { type: 'string' } },
              required: ['file_path'],
            },
          },
        ],
      }),
    );
    const events = [...(await res.text()).matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    expect(events[0]).toBe('message_start');
    expect(events).toContain('content_block_delta');
    expect(events.slice(-2)).toEqual(['message_delta', 'message_stop']);
  });

  it('records an aborted stream when the client disconnects', async () => {
    const t = setup({ mock: { chunkDelayMs: 20 } });
    const res = await t.messages(messageBody({ stream: true }));
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(t.store.records.at(-1)).toMatchObject({ status: 499, stream: true });
    expect(t.lines.at(-1)).toContain('"aborted":true');
  });
});

describe('POST /v1/messages: non-streaming', () => {
  it('rewrites the model to the alias and meters usage', async () => {
    const t = setup();
    const res = await t.messages(messageBody());
    const body = await res.json();
    expect(body.model).toBe('sealcode-pro');
    expect(body.type).toBe('message');
    const rec = t.store.records.at(-1)!;
    expect(rec.usage.outputTokens).toBeGreaterThan(0);
    // The mock's toy prompt cache wrote the system prompt on this first request.
    expect(rec.usage.cacheWriteTokens).toBeGreaterThan(0);
  });

  it('reports cache reads on a repeated prefix', async () => {
    const t = setup();
    await t.messages(messageBody());
    await t.messages(messageBody());
    expect(t.store.records.at(-1)!.usage.cacheReadTokens).toBeGreaterThan(0);
  });
});

describe('POST /v1/messages: upstream errors', () => {
  it.each([
    ['MOCK_TOO_LONG', 400, 'invalid_request_error'],
    ['MOCK_UPSTREAM_500', 500, 'api_error'],
    ['MOCK_OVERLOADED', 529, 'overloaded_error'],
  ])('passes %s through unchanged', async (trigger, status, type) => {
    const t = setup();
    const res = await t.messages(
      messageBody({ messages: [{ role: 'user', content: `${trigger} ${PROMPT}` }] }),
    );
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.type).toBe(type);
    // Unchanged: no request_id injected, same message wording (Claude Code matches on it).
    expect(body.request_id).toBeUndefined();
    if (trigger === 'MOCK_TOO_LONG') expect(body.error.message).toMatch(/^prompt is too long/);
    if (trigger === 'MOCK_OVERLOADED') expect(res.headers.get('x-should-retry')).toBe('true');
    expect(t.store.records.at(-1)).toMatchObject({ status, errorType: type });
  });

  it('returns an Anthropic 502 when the upstream is unreachable', async () => {
    const t = setup({ upstreamDown: true });
    const res = await t.messages(messageBody());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ type: 'error', error: { type: 'api_error' } });
    expect(t.store.records.at(-1)).toMatchObject({
      status: 502,
      errorType: 'upstream_unavailable',
    });
  });
});

describe('POST /v1/messages: limits', () => {
  it('enforces the per-key rate limit with an integer retry-after', async () => {
    const t = setup({ ctx: { rateLimitRpm: 2 } });
    expect((await t.messages(messageBody())).status).toBe(200);
    expect((await t.messages(messageBody())).status).toBe(200);
    const res = await t.messages(messageBody());
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await res.json()).toMatchObject({ type: 'error', error: { type: 'rate_limit_error' } });
    expect(t.store.records.at(-1)).toMatchObject({ status: 429, errorType: 'rate_limited' });
    t.advance(30_000);
    expect((await t.messages(messageBody())).status).toBe(200);
  });

  function withUsage(t: ReturnType<typeof setup>, tokens: number, userId = 'user_1') {
    t.store.records.push({
      requestId: 'req_prev',
      orgId: 'org_1',
      userId,
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
      createdAt: new Date(t.now()),
    });
  }

  it('hard-stops an exhausted org budget with a readable, non-retryable 429', async () => {
    const t = setup({ ctx: { budgetMode: 'hard', orgBudgetTokens: 1_000 } });
    withUsage(t, 1_000);
    const res = await t.messages(messageBody());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(60);
    expect(res.headers.get('x-should-retry')).toBe('false');
    const body = await res.json();
    expect(body.error.message).toContain('monthly token budget');
    expect(body.error.message).toContain('/app/budgets');
    expect(t.mock.requests).toHaveLength(0);
  });

  it('lets soft-mode orgs continue past the budget', async () => {
    const t = setup({ ctx: { budgetMode: 'soft', orgBudgetTokens: 1_000 } });
    withUsage(t, 5_000);
    expect((await t.messages(messageBody())).status).toBe(200);
  });

  it('always hard-stops trials at their allowance, pointing to sales', async () => {
    const t = setup({
      ctx: { plan: 'trial', orgStatus: 'trial', budgetMode: 'soft', orgBudgetTokens: 1_000 },
    });
    withUsage(t, 1_000);
    const res = await t.messages(messageBody());
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toContain('/contact');
  });

  it('enforces seat budgets in hard mode', async () => {
    const t = setup({ ctx: { budgetMode: 'hard', orgBudgetTokens: null, seatBudgetTokens: 500 } });
    withUsage(t, 400, 'user_2');
    expect((await t.messages(messageBody())).status).toBe(200);
    withUsage(t, 600);
    t.advance(5_000);
    const res = await t.messages(messageBody());
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toContain('seat budget');
  });

  it('refuses expired trials and suspended orgs with 403', async () => {
    const expired = setup({
      ctx: { orgStatus: 'trial', plan: 'trial', trialEndsAt: new Date(Date.UTC(2026, 9, 1)) },
    });
    const res = await expired.messages(messageBody());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatchObject({ type: 'permission_error' });

    const suspended = setup({ ctx: { orgStatus: 'suspended' } });
    expect((await suspended.messages(messageBody())).status).toBe(403);
  });
});
