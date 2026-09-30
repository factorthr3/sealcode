import { describe, expect, it } from 'vitest';
import { lastUpstream, PROMPT, setup } from './helpers';

const chatBody = (extra: Record<string, unknown> = {}) => ({
  model: 'sealcode-fast',
  messages: [
    { role: 'system', content: 'You are terse.' },
    { role: 'user', content: PROMPT },
  ],
  ...extra,
});

describe('POST /v1/chat/completions', () => {
  it('returns OpenAI-shaped errors', async () => {
    const t = setup();
    const res = await t.post('/v1/chat/completions', chatBody());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: { type: 'authentication_error', param: null },
    });
  });

  it('maps the alias, forces TEE routing and meters a non-streamed reply', async () => {
    const t = setup();
    const res = await t.chat(chatBody({ provider: { aci_verified: false } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe('sealcode-fast');
    const up = lastUpstream(t.mock);
    expect(up.body.model).toBe('z-ai/glm-5.3-flash');
    expect(up.body.provider).toEqual({ aci_verified: true, zdr: true });
    expect(t.store.records.at(-1)).toMatchObject({
      endpoint: 'chat_completions',
      modelAlias: 'sealcode-fast',
      status: 200,
    });
    expect(t.store.records.at(-1)!.usage.outputTokens).toBeGreaterThan(0);
  });

  it('requests usage upstream and hides the extra chunk from clients that did not ask', async () => {
    const t = setup();
    const res = await t.chat(chatBody({ stream: true }));
    const text = await res.text();
    expect(lastUpstream(t.mock).body.stream_options).toEqual({ include_usage: true });
    expect(text).not.toContain('"usage"');
    expect(text).toContain('data: [DONE]');
    expect(text).not.toContain('z-ai/glm-5.3-flash');
    expect(text).toContain('"model":"sealcode-fast"');
    expect(t.store.records.at(-1)!.usage.inputTokens).toBeGreaterThan(0);
  });

  it('keeps the usage chunk for clients that asked for it', async () => {
    const t = setup();
    const res = await t.chat(chatBody({ stream: true, stream_options: { include_usage: true } }));
    expect(await res.text()).toContain('"usage"');
  });

  it('passes upstream errors through', async () => {
    const t = setup();
    const res = await t.chat(
      chatBody({ messages: [{ role: 'user', content: `MOCK_UPSTREAM_500 ${PROMPT}` }] }),
    );
    expect(res.status).toBe(500);
  });

  it('returns tool calls', async () => {
    const t = setup();
    const res = await t.chat(
      chatBody({
        tools: [
          { type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } },
        ],
      }),
    );
    const body = await res.json();
    expect(body.choices[0].finish_reason).toBe('tool_calls');
  });
});

describe('GET /v1/models', () => {
  it('serves the Anthropic shape to Anthropic clients', async () => {
    const t = setup();
    const res = await t.app.request('/v1/models?limit=1000', {
      headers: { authorization: `Bearer ${t.key}`, 'anthropic-version': '2023-06-01' },
    });
    const body = await res.json();
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(['sealcode-pro', 'sealcode-fast']);
    expect(body.data[0]).toMatchObject({ type: 'model', display_name: 'Sealcode Pro' });
    expect(body.has_more).toBe(false);
    expect(JSON.stringify(body)).not.toContain('glm');
  });

  it('serves the OpenAI shape otherwise', async () => {
    const t = setup();
    const res = await t.app.request('/v1/models', {
      headers: { authorization: `Bearer ${t.key}` },
    });
    expect(await res.json()).toMatchObject({
      object: 'list',
      data: [{ id: 'sealcode-pro', object: 'model' }, { id: 'sealcode-fast' }],
    });
  });

  it('requires a key', async () => {
    const t = setup();
    expect((await t.app.request('/v1/models')).status).toBe(401);
  });
});

describe('housekeeping routes', () => {
  it("answers Claude Code's warming probe", async () => {
    const t = setup();
    expect((await t.app.request('/api/hello', { method: 'HEAD' })).status).toBe(200);
  });

  it('does not forward token counting upstream', async () => {
    const t = setup();
    const res = await t.post(
      '/v1/messages/count_tokens',
      { model: 'sealcode-pro', messages: [{ role: 'user', content: PROMPT }] },
      {
        authorization: `Bearer ${t.key}`,
      },
    );
    expect(res.status).toBe(404);
    expect(t.mock.requests).toHaveLength(0);
  });

  it('reports health and 404s unknown paths in Anthropic format', async () => {
    const t = setup();
    expect(await (await t.app.request('/healthz')).json()).toEqual({ ok: true });
    const res = await t.app.request('/v2/nothing');
    expect(res.status).toBe(404);
    expect((await res.json()).type).toBe('error');
  });
});
