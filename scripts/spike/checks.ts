/**
 * Phase 0 compatibility checks against Phala's Messages endpoint (or any Anthropic-format base
 * URL, such as the local mock upstream or our own gateway). Each check returns pass, fail or
 * skip with short evidence. Evidence is metadata only: status codes, event names, counts.
 */

export type Outcome = 'pass' | 'fail' | 'skip';

export interface CheckResult {
  id: string;
  title: string;
  outcome: Outcome;
  evidence: string[];
}

export interface Target {
  baseUrl: string;
  apiKey: string;
  /** Model IDs to test. For Phala these are upstream IDs; for our gateway, aliases. */
  models: { main: string; fast: string };
  /** Adds `provider: {aci_verified, zdr}` to requests (Phala only, the gateway adds it itself). */
  sendProvider: boolean;
  /** Receipts endpoint is only available on Phala (or the mock). */
  receiptsBaseUrl?: string;
}

interface SseEvent {
  event: string;
  data: unknown;
}

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read a file from the repository and return its contents.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the repo root' } },
      required: ['path'],
    },
  },
];

function headers(t: Target): Record<string, string> {
  return {
    authorization: `Bearer ${t.apiKey}`,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
}

function withProvider(t: Target, body: Record<string, unknown>) {
  return t.sendProvider ? { ...body, provider: { aci_verified: true, zdr: true } } : body;
}

async function post(t: Target, path: string, body: Record<string, unknown>) {
  const started = performance.now();
  const res = await fetch(`${t.baseUrl}${path}`, {
    method: 'POST',
    headers: headers(t),
    body: JSON.stringify(withProvider(t, body)),
  });
  return { res, started };
}

export async function readSse(res: Response, onEvent?: (e: SseEvent) => void): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  if (!res.body) return events;
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length === 0) continue;
      const joined = data.join('\n');
      let parsed: unknown = joined;
      try {
        parsed = JSON.parse(joined);
      } catch {
        // `[DONE]` and other non-JSON payloads stay as strings.
      }
      const e = { event, data: parsed };
      events.push(e);
      onEvent?.(e);
    }
  }
  return events;
}

function result(id: string, title: string, outcome: Outcome, evidence: string[]): CheckResult {
  return { id, title, outcome, evidence };
}

async function errorSummary(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: { type?: string; message?: string } };
    return `HTTP ${res.status} ${body.error?.type ?? ''}: ${(body.error?.message ?? '').slice(0, 160)}`;
  } catch {
    return `HTTP ${res.status} (non-JSON body, ${text.length} bytes)`;
  }
}

export async function checkToolUse(t: Target): Promise<CheckResult> {
  const title = 'Tool use (streaming and non-streaming)';
  const evidence: string[] = [];
  const base = {
    model: t.models.main,
    max_tokens: 512,
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'read_file' },
    messages: [{ role: 'user', content: 'Read package.json using the read_file tool.' }],
  };

  const { res } = await post(t, '/v1/messages', base);
  if (!res.ok)
    return result('tool_use', title, 'fail', [`non-streaming: ${await errorSummary(res)}`]);
  const msg = (await res.json()) as { stop_reason?: string; content?: { type: string }[] };
  const nsTool = msg.content?.some((b) => b.type === 'tool_use') ?? false;
  evidence.push(`non-streaming: stop_reason=${msg.stop_reason}, tool_use block=${nsTool}`);

  const { res: sres } = await post(t, '/v1/messages', { ...base, stream: true });
  if (!sres.ok)
    return result('tool_use', title, 'fail', [
      ...evidence,
      `streaming: ${await errorSummary(sres)}`,
    ]);
  const events = await readSse(sres);
  const toolStart = events.some(
    (e) =>
      e.event === 'content_block_start' &&
      (e.data as { content_block?: { type?: string } }).content_block?.type === 'tool_use',
  );
  const jsonDelta = events.some(
    (e) =>
      e.event === 'content_block_delta' &&
      (e.data as { delta?: { type?: string } }).delta?.type === 'input_json_delta',
  );
  const stop = events
    .filter((e) => e.event === 'message_delta')
    .map((e) => (e.data as { delta?: { stop_reason?: string } }).delta?.stop_reason)
    .find(Boolean);
  evidence.push(
    `streaming: tool_use start=${toolStart}, input_json_delta=${jsonDelta}, stop_reason=${stop}`,
  );
  const ok =
    nsTool && msg.stop_reason === 'tool_use' && toolStart && jsonDelta && stop === 'tool_use';
  return result('tool_use', title, ok ? 'pass' : 'fail', evidence);
}

const EXPECTED_ORDER = [
  'message_start',
  'content_block_start',
  'content_block_delta',
  'content_block_stop',
  'message_delta',
  'message_stop',
];

export async function checkStreamShape(t: Target): Promise<CheckResult> {
  const title = 'Stream shape matches Anthropic SSE';
  const { res } = await post(t, '/v1/messages', {
    model: t.models.main,
    max_tokens: 64,
    stream: true,
    messages: [{ role: 'user', content: 'Say hello in five words.' }],
  });
  if (!res.ok) return result('stream_shape', title, 'fail', [await errorSummary(res)]);
  const contentType = res.headers.get('content-type') ?? '';
  const events = await readSse(res);
  const names = events.map((e) => e.event).filter((n) => n !== 'ping');
  const seen = EXPECTED_ORDER.filter((n) => names.includes(n));
  const inOrder = EXPECTED_ORDER.every(
    (n, i) => i === 0 || names.indexOf(n) >= names.indexOf(EXPECTED_ORDER[i - 1]!),
  );
  const deltaUsage = events.some(
    (e) => e.event === 'message_delta' && (e.data as { usage?: unknown }).usage,
  );
  const evidence = [
    `content-type: ${contentType}`,
    `events: ${[...new Set(names)].join(', ')}`,
    `message_delta carries usage: ${deltaUsage}`,
  ];
  const ok =
    contentType.includes('text/event-stream') &&
    seen.length === EXPECTED_ORDER.length &&
    inOrder &&
    deltaUsage;
  return result('stream_shape', title, ok ? 'pass' : 'fail', evidence);
}

export async function checkUsageAndCaching(t: Target): Promise<CheckResult> {
  const title = 'Usage fields and prompt caching';
  // ~6K tokens of stable system prompt, above typical minimum cacheable lengths.
  const system = [
    {
      type: 'text',
      text: `You are a code reviewer for a payments service.\n${'Rule: prefer explicit types and small functions. '.repeat(600)}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
  const body = {
    model: t.models.main,
    max_tokens: 16,
    system,
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  };
  const usages: Record<string, unknown>[] = [];
  for (let i = 0; i < 2; i++) {
    const { res } = await post(t, '/v1/messages', body);
    if (!res.ok)
      return result('usage_caching', title, 'fail', [
        `request ${i + 1}: ${await errorSummary(res)}`,
      ]);
    usages.push(((await res.json()) as { usage: Record<string, unknown> }).usage);
  }
  const [first, second] = usages as [Record<string, unknown>, Record<string, unknown>];
  const hasCounts =
    typeof first.input_tokens === 'number' && typeof first.output_tokens === 'number';
  const cacheRead = Number(second.cache_read_input_tokens ?? 0);
  const evidence = [
    `first usage: ${JSON.stringify(first)}`,
    `second usage: ${JSON.stringify(second)}`,
    cacheRead > 0
      ? `cache reads observed: ${cacheRead}`
      : 'no cache reads observed on the repeat request',
  ];
  // Counts are required; caching is recorded as evidence because it changes margin, not viability.
  return result('usage_caching', title, hasCounts ? 'pass' : 'fail', evidence);
}

export async function checkReceipts(t: Target): Promise<CheckResult> {
  const title = 'Receipts on streamed responses show upstream.verified';
  if (!t.receiptsBaseUrl)
    return result('receipts', title, 'skip', ['no receipts endpoint for this target']);
  const { res } = await post(t, '/v1/messages', {
    model: t.models.main,
    max_tokens: 16,
    stream: true,
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  });
  if (!res.ok) return result('receipts', title, 'fail', [await errorSummary(res)]);
  const receiptId = res.headers.get('x-receipt-id');
  await readSse(res);
  if (!receiptId)
    return result('receipts', title, 'fail', ['x-receipt-id missing on streamed response']);
  // The wire hash covers the whole body, so the receipt is fetched after the stream ends.
  const rres = await fetch(
    `${t.receiptsBaseUrl}/v1/aci/receipts/${encodeURIComponent(receiptId)}`,
    {
      headers: { authorization: `Bearer ${t.apiKey}` },
    },
  );
  if (!rres.ok) return result('receipts', title, 'fail', [`receipt fetch: HTTP ${rres.status}`]);
  const receipt = (await rres.json()) as {
    event_log?: { type?: string; result?: string; required?: boolean; session_id?: string }[];
  };
  const verified = receipt.event_log?.find((e) => e.type === 'upstream.verified');
  const ok = verified?.result === 'verified' && verified.required === true;
  return result('receipts', title, ok ? 'pass' : 'fail', [
    `x-receipt-id present (${receiptId.slice(0, 12)}…)`,
    `upstream.verified: result=${verified?.result}, required=${verified?.required}, session=${verified?.session_id ? 'yes' : 'no'}`,
  ]);
}

export async function checkRoutingConstraints(t: Target): Promise<CheckResult> {
  const title = 'provider {aci_verified, zdr} accepted for both models';
  const evidence: string[] = [];
  let ok = true;
  for (const model of [t.models.main, t.models.fast]) {
    const res = await fetch(`${t.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: headers(t),
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        ...(t.sendProvider ? { provider: { aci_verified: true, zdr: true } } : {}),
      }),
    });
    if (res.ok) {
      evidence.push(`${model}: HTTP 200 with aci_verified+zdr`);
      await res.body?.cancel();
    } else {
      ok = false;
      evidence.push(`${model}: ${await errorSummary(res)} (record: no ZDR route?)`);
    }
  }
  return result('routing', title, ok ? 'pass' : 'fail', evidence);
}

export async function checkContextLimit(t: Target): Promise<CheckResult> {
  const title = 'Over-length prompt returns Anthropic "prompt is too long"';
  // ~1.3M tokens of filler, beyond the 1,048,576-token window.
  const filler = 'lorem ipsum dolor sit amet '.repeat(260_000);
  const { res } = await post(t, '/v1/messages', {
    model: t.models.fast,
    max_tokens: 8,
    messages: [{ role: 'user', content: filler }],
  });
  if (res.ok) {
    await res.body?.cancel();
    return result('context_limit', title, 'fail', ['over-length request succeeded']);
  }
  const text = await res.text();
  let type = '';
  let message = '';
  try {
    const body = JSON.parse(text) as { type?: string; error?: { type?: string; message?: string } };
    type = `${body.type}/${body.error?.type}`;
    message = body.error?.message ?? '';
  } catch {
    // Non-JSON error body.
  }
  const ok =
    res.status === 400 &&
    type === 'error/invalid_request_error' &&
    /prompt is too long/i.test(message);
  return result('context_limit', title, ok ? 'pass' : 'fail', [
    `HTTP ${res.status}, ${type || 'non-JSON body'}`,
    `message: ${message.slice(0, 120)}`,
  ]);
}

/** Fields Claude Code sends to gateway aliases it doesn't recognise (see gateway protocol guide). */
export async function checkClaudeCodeFields(t: Target): Promise<CheckResult> {
  const title = 'Fields Claude Code sends to unrecognised model IDs';
  const probes: [string, Record<string, unknown>][] = [
    ['thinking: adaptive', { thinking: { type: 'adaptive' } }],
    ['output_config.effort', { output_config: { effort: 'medium' } }],
    ['context_management', { context_management: { edits: [] } }],
    ['tool strict flag', { tools: [{ ...TOOLS[0], strict: true }] }],
    [
      'cache_control on system block',
      { system: [{ type: 'text', text: 'Be brief.', cache_control: { type: 'ephemeral' } }] },
    ],
  ];
  const evidence: string[] = [];
  for (const [label, extra] of probes) {
    const { res } = await post(t, '/v1/messages', {
      model: t.models.main,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      ...extra,
    });
    evidence.push(res.ok ? `${label}: accepted` : `${label}: ${await errorSummary(res)}`);
    if (res.ok) await res.body?.cancel();
  }
  // Informational: rejections tell us which compat settings the CLI must apply.
  return result('claude_code_fields', title, 'pass', evidence);
}

export async function checkCountTokens(t: Target): Promise<CheckResult> {
  const title = '/v1/messages/count_tokens (optional)';
  const res = await fetch(`${t.baseUrl}/v1/messages/count_tokens`, {
    method: 'POST',
    headers: headers(t),
    body: JSON.stringify({ model: t.models.main, messages: [{ role: 'user', content: 'Hello' }] }),
  });
  const evidence = [
    res.ok
      ? `HTTP 200: ${await res.text()}`
      : `HTTP ${res.status}: Claude Code falls back to a character estimate`,
  ];
  return result('count_tokens', title, 'pass', evidence);
}

export async function checkLatency(t: Target, runs = 5): Promise<CheckResult> {
  const title = 'Latency baseline (time to first token, tokens/s)';
  const evidence: string[] = [];
  for (const model of [t.models.main, t.models.fast]) {
    const ttfts: number[] = [];
    const rates: number[] = [];
    for (let i = 0; i < runs; i++) {
      const { res, started } = await post(t, '/v1/messages', {
        model,
        max_tokens: 256,
        stream: true,
        messages: [
          {
            role: 'user',
            content: 'Write a TypeScript function that parses an ISO date, with a docstring.',
          },
        ],
      });
      if (!res.ok) {
        evidence.push(`${model}: ${await errorSummary(res)}`);
        break;
      }
      let firstToken = 0;
      const events = await readSse(res, (e) => {
        if (!firstToken && e.event === 'content_block_delta') firstToken = performance.now();
      });
      const ended = performance.now();
      const output =
        events
          .filter((e) => e.event === 'message_delta')
          .map((e) =>
            Number((e.data as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0),
          )
          .pop() ?? 0;
      ttfts.push((firstToken || ended) - started);
      rates.push(output / Math.max((ended - (firstToken || started)) / 1000, 0.001));
    }
    if (ttfts.length) {
      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
      evidence.push(
        `${model}: median TTFT ${med(ttfts).toFixed(0)} ms, median ${med(rates).toFixed(1)} tok/s over ${ttfts.length} runs`,
      );
    }
  }
  return result('latency', title, 'pass', evidence);
}

export const ALL_CHECKS = [
  checkToolUse,
  checkStreamShape,
  checkUsageAndCaching,
  checkReceipts,
  checkRoutingConstraints,
  checkContextLimit,
  checkClaudeCodeFields,
  checkCountTokens,
  checkLatency,
];
