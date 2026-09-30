/**
 * A stand-in for Phala's attested inference gateway, used by every default test and by local
 * development. It speaks the Anthropic Messages and OpenAI chat-completions formats, issues
 * receipts, and enforces the one thing the real upstream must never see us skip:
 * `provider.aci_verified: true`.
 *
 * Test triggers (in the last user message): MOCK_TOO_LONG, MOCK_UPSTREAM_500, MOCK_OVERLOADED,
 * MOCK_FIXTURE:<name> (replays test/fixtures/<name>.sse byte for byte).
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { cannedReply } from './replies';

export interface MockUpstreamOptions {
  apiKey?: string;
  /** Delay between streamed chunks. */
  chunkDelayMs?: number;
  /** Delay before the response starts. */
  firstByteDelayMs?: number;
}

export interface RecordedRequest {
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const MODELS: Record<string, { provider: string; context: number }> = {
  'z-ai/glm-5.3': { provider: 'phala', context: 1_048_576 },
  'z-ai/glm-5.3-flash': { provider: 'near-ai', context: 1_048_576 },
};

const FIXTURES = new URL('../test/fixtures/', import.meta.url);

type Block = { type?: string; text?: string; content?: unknown; cache_control?: unknown };

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Block[])
      .map((b) =>
        typeof b.text === 'string' ? b.text : typeof b.content === 'string' ? b.content : '',
      )
      .join('\n');
  }
  return '';
}

function hasCacheControl(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    (value as Block[]).some((b) => b && typeof b === 'object' && 'cache_control' in b)
  );
}

const tokens = (chars: number) => Math.max(1, Math.ceil(chars / 4));

function chunkText(text: string, size = 24): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function sleep(ms: number) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

function anthropicError(status: number, type: string, message: string) {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function createMockUpstream(options: MockUpstreamOptions = {}) {
  const apiKey = options.apiKey ?? 'mock-phala-key';
  const requests: RecordedRequest[] = [];
  const receipts = new Map<string, unknown>();
  const cachedPrefixes = new Set<string>();
  const app = new Hono();

  function newReceipt(model: string, endpoint: string, rawBody: string): string {
    const id = `rcpt-${randomBytes(12).toString('hex')}`;
    const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
    receipts.set(id, {
      api_version: 'aci/1',
      receipt_id: id,
      chat_id: randomBytes(16).toString('hex'),
      workload_id: sha('mock-workload'),
      workload_keyset_digest: sha('mock-keyset'),
      endpoint,
      method: 'POST',
      served_at: Math.floor(Date.now() / 1000),
      event_log: [
        { seq: 0, type: 'request.received', body_hash: sha(rawBody) },
        { seq: 2, type: 'route.selected', target_route_id: model },
        {
          seq: 5,
          type: 'upstream.verified',
          provider: MODELS[model]?.provider ?? 'phala',
          model_id: model,
          result: 'verified',
          required: true,
          session_id: `as_${randomBytes(8).toString('hex')}`,
        },
        { seq: 7, type: 'response.returned', wire_hash: sha(id) },
      ],
      signature: 'mock-signature',
    });
    return id;
  }

  app.use('/v1/*', async (c, next) => {
    if (c.req.header('authorization') !== `Bearer ${apiKey}`) {
      return anthropicError(401, 'authentication_error', 'invalid x-api-key');
    }
    await next();
  });

  app.get('/v1/models', (c) =>
    c.json({
      data: Object.entries(MODELS).map(([id, m]) => ({
        id,
        context_length: m.context,
        is_tee: true,
        providers: [m.provider],
      })),
    }),
  );

  app.get('/v1/aci/receipts/:id', (c) => {
    const receipt = receipts.get(c.req.param('id'));
    return receipt ? c.json(receipt) : anthropicError(404, 'not_found_error', 'receipt not found');
  });

  async function common(path: string, req: Request) {
    const raw = await req.text();
    const body = JSON.parse(raw) as Record<string, unknown>;
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      if (k !== 'authorization') headers[k] = v;
    });
    requests.push({ path, headers, body });
    const provider = body.provider as { aci_verified?: unknown } | undefined;
    const model = String(body.model);
    const messages = Array.isArray(body.messages)
      ? (body.messages as { role?: string; content?: unknown }[])
      : [];
    const last = messages.at(-1);
    const lastText = textOf(last?.content);
    const allChars =
      textOf(body.system).length + messages.reduce((n, m) => n + textOf(m.content).length, 0);
    return { raw, body, provider, model, messages, last, lastText, allChars };
  }

  function preflight(r: Awaited<ReturnType<typeof common>>): Response | null {
    if (r.provider?.aci_verified !== true) {
      return anthropicError(
        400,
        'invalid_request_error',
        'provider.aci_verified must be true on this account',
      );
    }
    if (!MODELS[r.model]) return anthropicError(404, 'not_found_error', `model: ${r.model}`);
    if (r.lastText.includes('MOCK_TOO_LONG') || r.allChars > 4_200_000) {
      return anthropicError(
        400,
        'invalid_request_error',
        `prompt is too long: ${tokens(r.allChars) + 1_048_576} tokens > 1048576 maximum`,
      );
    }
    if (r.lastText.includes('MOCK_UPSTREAM_500'))
      return anthropicError(500, 'api_error', 'Internal server error');
    if (r.lastText.includes('MOCK_OVERLOADED')) {
      const res = anthropicError(529, 'overloaded_error', 'Overloaded');
      res.headers.set('x-should-retry', 'true');
      return res;
    }
    return null;
  }

  // --- Anthropic Messages -------------------------------------------------------------------
  app.post('/v1/messages', async (c) => {
    const r = await common('/v1/messages', c.req.raw);
    const early = preflight(r);
    if (early) return early;
    const receiptId = newReceipt(r.model, '/v1/messages', r.raw);
    const baseHeaders = { 'x-receipt-id': receiptId, 'x-aci-identity': 'mock-gateway' };

    const fixture = /MOCK_FIXTURE:([a-z0-9_-]+)/.exec(r.lastText)?.[1];
    if (fixture) {
      const sse = readFileSync(new URL(`${fixture}.sse`, FIXTURES), 'utf8');
      return new Response(sse, {
        headers: { ...baseHeaders, 'content-type': 'text/event-stream; charset=utf-8' },
      });
    }

    // Usage, with a toy prompt cache keyed on the system prompt.
    const systemChars = textOf(r.body.system).length;
    let input = tokens(r.allChars);
    let cacheRead = 0;
    let cacheWrite = 0;
    if (hasCacheControl(r.body.system) && systemChars > 0) {
      const key = createHash('sha256').update(textOf(r.body.system)).digest('hex');
      if (cachedPrefixes.has(key)) cacheRead = tokens(systemChars);
      else cacheWrite = tokens(systemChars);
      cachedPrefixes.add(key);
      input = Math.max(1, input - cacheRead - cacheWrite);
    }

    const tools = Array.isArray(r.body.tools)
      ? (r.body.tools as { name: string; input_schema?: { required?: string[] } }[])
      : [];
    const lastIsToolResult =
      Array.isArray(r.last?.content) &&
      (r.last.content as Block[]).some((b) => b.type === 'tool_result');
    const useTool = tools.length > 0 && !lastIsToolResult;
    const choice = r.body.tool_choice as { type?: string; name?: string } | undefined;
    const tool = useTool
      ? (tools.find((t) => choice?.type === 'tool' && t.name === choice.name) ?? tools[0]!)
      : null;
    const toolInput = tool
      ? Object.fromEntries((tool.input_schema?.required ?? ['path']).map((k) => [k, 'README.md']))
      : null;
    const text = useTool
      ? ''
      : lastIsToolResult
        ? 'Done. I read the file and applied the change. MOCK_COMPLETION_TEXT'
        : cannedReply(r.lastText);
    const outputTokens = tool ? 12 : tokens(text.length);
    const stopReason = tool ? 'tool_use' : 'end_turn';
    const usage = {
      input_tokens: input,
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
      output_tokens: outputTokens,
    };
    const id = `msg_mock_${randomBytes(8).toString('hex')}`;

    if (r.body.stream !== true) {
      const content = tool
        ? [{ type: 'tool_use', id: 'toolu_mock_1', name: tool.name, input: toolInput }]
        : [{ type: 'text', text }];
      return c.json(
        {
          id,
          type: 'message',
          role: 'assistant',
          model: r.model,
          content,
          stop_reason: stopReason,
          stop_sequence: null,
          usage,
        },
        200,
        baseHeaders,
      );
    }

    const events: [string, unknown][] = [
      [
        'message_start',
        {
          type: 'message_start',
          message: {
            id,
            type: 'message',
            role: 'assistant',
            model: r.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { ...usage, output_tokens: 1 },
          },
        },
      ],
    ];
    if (tool) {
      events.push([
        'content_block_start',
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_mock_1', name: tool.name, input: {} },
        },
      ]);
      events.push(['ping', { type: 'ping' }]);
      for (const part of chunkText(JSON.stringify(toolInput), 8)) {
        events.push([
          'content_block_delta',
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: part },
          },
        ]);
      }
    } else {
      events.push([
        'content_block_start',
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      ]);
      events.push(['ping', { type: 'ping' }]);
      for (const part of chunkText(text)) {
        events.push([
          'content_block_delta',
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } },
        ]);
      }
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index: 0 }]);
    events.push([
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: outputTokens },
      },
    ]);
    events.push(['message_stop', { type: 'message_stop' }]);
    return streamResponse(
      events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`),
      baseHeaders,
    );
  });

  // --- OpenAI chat completions --------------------------------------------------------------
  app.post('/v1/chat/completions', async (c) => {
    const r = await common('/v1/chat/completions', c.req.raw);
    const early = preflight(r);
    if (early) {
      // Re-shape into the OpenAI envelope.
      const e = (await early.json()) as { error: { type: string; message: string } };
      return c.json(
        { error: { message: e.error.message, type: e.error.type, param: null, code: null } },
        early.status as 400,
      );
    }
    const receiptId = newReceipt(r.model, '/v1/chat/completions', r.raw);
    const headers = { 'x-receipt-id': receiptId };
    const tools = Array.isArray(r.body.tools)
      ? (r.body.tools as { function?: { name?: string } }[])
      : [];
    const lastIsTool = r.last?.role === 'tool';
    const toolName = tools.length > 0 && !lastIsTool ? (tools[0]?.function?.name ?? 'tool') : null;
    const text = toolName
      ? null
      : lastIsTool
        ? 'Done. MOCK_COMPLETION_TEXT'
        : cannedReply(r.lastText);
    const promptTokens = tokens(r.allChars);
    const completionTokens = toolName ? 10 : tokens(text!.length);
    const usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      prompt_tokens_details: { cached_tokens: 0 },
    };
    const id = `chatcmpl-mock-${randomBytes(6).toString('hex')}`;
    const created = Math.floor(Date.now() / 1000);
    const toolCall = toolName
      ? {
          index: 0,
          id: 'call_mock_1',
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify({ path: 'README.md' }) },
        }
      : null;
    const finish = toolName ? 'tool_calls' : 'stop';

    if (r.body.stream !== true) {
      return c.json(
        {
          id,
          object: 'chat.completion',
          created,
          model: r.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: text,
                ...(toolCall ? { tool_calls: [toolCall] } : {}),
              },
              finish_reason: finish,
            },
          ],
          usage,
        },
        200,
        headers,
      );
    }
    const chunk = (delta: unknown, finishReason: string | null) =>
      `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: r.model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
    const parts = [chunk({ role: 'assistant', content: '' }, null)];
    if (toolCall) parts.push(chunk({ tool_calls: [toolCall] }, null));
    else for (const p of chunkText(text!)) parts.push(chunk({ content: p }, null));
    parts.push(chunk({}, finish));
    const streamOptions = r.body.stream_options as { include_usage?: boolean } | undefined;
    if (streamOptions?.include_usage) {
      parts.push(
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: r.model, choices: [], usage })}\n\n`,
      );
    }
    parts.push('data: [DONE]\n\n');
    return streamResponse(parts, headers);
  });

  function streamResponse(parts: string[], headers: Record<string, string>): Response {
    const encoder = new TextEncoder();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        await sleep(options.firstByteDelayMs ?? 0);
        for (const part of parts) {
          if (cancelled) return;
          controller.enqueue(encoder.encode(part));
          await sleep(options.chunkDelayMs ?? 0);
        }
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, {
      headers: {
        ...headers,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
    });
  }

  return { app, requests, receipts };
}
