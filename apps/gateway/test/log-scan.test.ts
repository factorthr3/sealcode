/**
 * Runs every request path over real HTTP sockets, including errors and aborts, with fixture
 * content in prompts, system prompts, model names and malformed bodies. The shared setup file
 * then asserts none of it reached a log line or process output. This test also checks the shape
 * of every log line.
 */
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { createLogger, LOG_FIELDS } from '@sealcode/shared/logger';
import { generateApiKey, hashApiKey } from '@sealcode/shared/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGateway, DEFAULT_CONFIG } from '../src/app';
import { MemoryStore } from '../src/store';
import { createMockUpstream } from '../mock/upstream';
import { capturedLogLines, defaultKeyContext, FORBIDDEN, PEPPER, PROMPT, SYSTEM } from './helpers';

const lines: string[] = [];
let base = '';
let key = '';
const servers: { close: () => void }[] = [];

function listen(fetchHandler: (req: Request) => Response | Promise<Response>): Promise<string> {
  return new Promise((resolve) => {
    const server = serve(
      { fetch: fetchHandler, port: 0, hostname: '127.0.0.1' },
      (info: AddressInfo) => resolve(`http://127.0.0.1:${info.port}`),
    );
    servers.push(server);
  });
}

beforeAll(async () => {
  const mock = createMockUpstream({ chunkDelayMs: 2 });
  const upstream = await listen(mock.app.fetch);
  const store = new MemoryStore();
  key = generateApiKey().key;
  store.addKey(hashApiKey(key, PEPPER), { ...defaultKeyContext, rateLimitRpm: 1_000 });
  const logger = createLogger({
    component: 'gateway',
    level: 'debug',
    sink: (l) => {
      lines.push(l);
      capturedLogLines.push(l);
    },
  });
  const app = createGateway({
    store,
    logger,
    config: {
      ...DEFAULT_CONFIG,
      upstreamBaseUrl: upstream,
      upstreamApiKey: 'mock-phala-key',
      keyPepper: PEPPER,
    },
  });
  base = await listen(app.fetch);
});

afterAll(() => {
  for (const s of servers) s.close();
});

const send = (path: string, body: string, auth = true) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(auth ? { authorization: `Bearer ${key}` } : {}),
    },
    body,
  });

const msg = (content: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: 'sealcode-pro',
    max_tokens: 64,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    ...extra,
  });

describe('log scan over real sockets', () => {
  it('handles every path without leaking content', async () => {
    const bodies: [string, string, boolean?][] = [
      ['/v1/messages', msg(PROMPT)],
      ['/v1/messages', msg(PROMPT, { stream: true })],
      ['/v1/messages', msg(`MOCK_FIXTURE:tool_use_stream ${PROMPT}`, { stream: true })],
      ['/v1/messages', msg(`MOCK_TOO_LONG ${PROMPT}`)],
      ['/v1/messages', msg(`MOCK_UPSTREAM_500 ${PROMPT}`, { stream: true })],
      ['/v1/messages', msg(PROMPT, { model: `${PROMPT}-model` })],
      ['/v1/messages', `{"messages":[{"content":"${PROMPT}"`],
      ['/v1/messages', msg(PROMPT), false],
      [
        '/v1/messages',
        JSON.stringify({
          model: 'sealcode-pro',
          max_tokens: 64,
          messages: [
            { role: 'user', content: PROMPT },
            {
              role: 'assistant',
              content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { path: PROMPT } }],
            },
            {
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: 't1', content: PROMPT }],
            },
          ],
          tools: [{ name: 'Read', input_schema: { type: 'object' } }],
        }),
      ],
      [
        '/v1/chat/completions',
        JSON.stringify({
          model: 'sealcode-fast',
          stream: true,
          messages: [{ role: 'user', content: PROMPT }],
        }),
      ],
      [
        '/v1/chat/completions',
        JSON.stringify({ model: 'sealcode-fast', messages: [{ role: 'tool', content: PROMPT }] }),
      ],
    ];
    for (const [path, body, auth] of bodies) {
      const res = await send(path, body, auth ?? true);
      await res.text();
    }

    // A client that hangs up mid-stream.
    const res = await send('/v1/messages', msg(PROMPT, { stream: true }));
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 50));

    expect(lines.length).toBeGreaterThanOrEqual(bodies.length);
    const haystack = lines.join('\n');
    for (const marker of FORBIDDEN) expect(haystack).not.toContain(marker);
  });

  it('writes only allowlisted fields', () => {
    const allowed = new Set(['ts', 'level', 'event', 'dropped_fields', ...Object.keys(LOG_FIELDS)]);
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      for (const field of Object.keys(parsed)) expect(allowed.has(field), field).toBe(true);
      expect(parsed.dropped_fields).toBeUndefined();
    }
  });
});
