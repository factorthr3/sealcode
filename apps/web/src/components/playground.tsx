'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MODEL_ALIASES, PLAYGROUND } from '@sealcode/shared';
import { MarkdownLite } from './markdown-lite';

/**
 * The landing-page playground. The browser gets a short-lived token from the web app, then talks
 * to the Sealcode gateway directly, so the web app never sees what visitors type. Each answer
 * shows its Phala receipt, which can be verified on the spot.
 */

type Model = (typeof PLAYGROUND.models)[number];

interface Receipt {
  id: string | null;
  requestId: string | null;
  model: Model;
  inputTokens: number;
  outputTokens: number;
  ttftMs: number | null;
  totalMs: number;
}

interface Verification {
  state: 'loading' | 'done' | 'error';
  verified?: boolean;
  required?: boolean | null;
  provider?: string | null;
  modelId?: string | null;
  signed?: boolean;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  receipt?: Receipt;
  error?: string;
  verification?: Verification;
}

const SUGGESTIONS = [
  'Write Vitest tests for a function that formats pence as GBP',
  'Validate and normalise UK postcodes in TypeScript',
  'Spot the SQL injection in a payments query and fix it',
  'Refactor a fee calculator with nested if/else into something cleaner',
];

const SYSTEM =
  'You are the Sealcode playground assistant: a senior software engineer helping a developer evaluate Sealcode. Answer coding questions concisely with correct, idiomatic code. Prefer TypeScript unless asked otherwise.';

const MAX_HISTORY_CHARS = 30_000;

/** Turn a network failure (the browser's bare "Failed to fetch") into something readable. */
async function reachable(request: Promise<Response>): Promise<Response> {
  try {
    return await request;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error(
      'We couldn’t reach the live playground. Try again shortly, or contact us for a live demo.',
      { cause: err },
    );
  }
}

async function* sse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      try {
        yield { event, data: JSON.parse(data.join('\n')) as Record<string, unknown> };
      } catch {
        // Ignore non-JSON frames.
      }
    }
  }
}

export function Playground() {
  const [model, setModel] = useState<Model>(PLAYGROUND.defaultModel);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number>(PLAYGROUND.maxRequestsPerToken);
  const token = useRef<{ value: string; gateway: string; expires: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);

  const getToken = useCallback(async (force = false) => {
    if (!force && token.current && token.current.expires - Date.now() > 30_000)
      return token.current;
    const res = await reachable(fetch('/api/playground/token', { method: 'POST' }));
    const body = (await res.json()) as {
      token?: string;
      gateway_url?: string;
      expires_at?: string;
      max_requests?: number;
      error?: string;
    };
    if (!res.ok || !body.token || !body.gateway_url)
      throw new Error(body.error ?? 'The playground is unavailable right now.');
    token.current = {
      value: body.token,
      gateway: body.gateway_url,
      expires: Date.parse(body.expires_at ?? '') || Date.now() + 600_000,
    };
    setRemaining(body.max_requests ?? PLAYGROUND.maxRequestsPerToken);
    return token.current;
  }, []);

  const patchLast = (fn: (t: Turn) => Turn) =>
    setTurns((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1]!)] : prev));

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput('');
    setBusy(true);
    const history = [...turns.filter((t) => !t.error), { role: 'user' as const, content: prompt }];
    // Keep the most recent turns within the playground's request size limit.
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    let size = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      size += history[i]!.content.length;
      if (size > MAX_HISTORY_CHARS && messages.length) break;
      messages.unshift({ role: history[i]!.role, content: history[i]!.content });
    }
    if (messages[0]?.role === 'assistant') messages.shift();
    setTurns((prev) => [
      ...prev,
      { role: 'user', content: prompt },
      { role: 'assistant', content: '' },
    ]);

    const started = performance.now();
    let firstToken: number | null = null;
    abort.current = new AbortController();
    try {
      let t = await getToken();
      const call = (tok: string, gateway: string) =>
        reachable(
          fetch(`${gateway}/v1/messages`, {
            method: 'POST',
            signal: abort.current!.signal,
            headers: {
              'content-type': 'application/json',
              'x-api-key': tok,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: PLAYGROUND.maxOutputTokens,
              stream: true,
              system: SYSTEM,
              messages,
            }),
          }),
        );
      let res = await call(t.value, t.gateway);
      if (res.status === 401) {
        t = await getToken(true);
        res = await call(t.value, t.gateway);
      }
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `The gateway returned ${res.status}.`);
      }
      setRemaining((r) => Math.max(0, r - 1));
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const { event, data } of sse(res.body)) {
        if (event === 'message_start') {
          const usage =
            (data.message as { usage?: Record<string, number> } | undefined)?.usage ?? {};
          inputTokens =
            (usage.input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0);
        } else if (event === 'content_block_delta') {
          const delta = data.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === 'text_delta' && delta.text) {
            firstToken ??= performance.now();
            const chunk = delta.text;
            patchLast((turn) => ({ ...turn, content: turn.content + chunk }));
          }
        } else if (event === 'message_delta') {
          outputTokens =
            (data.usage as { output_tokens?: number } | undefined)?.output_tokens ?? outputTokens;
        } else if (event === 'error') {
          throw new Error(
            (data.error as { message?: string } | undefined)?.message ??
              'The stream ended with an error.',
          );
        }
      }
      const receipt: Receipt = {
        id: res.headers.get('x-receipt-id'),
        requestId: res.headers.get('x-sealcode-request-id'),
        model,
        inputTokens,
        outputTokens,
        ttftMs: firstToken ? Math.round(firstToken - started) : null,
        totalMs: Math.round(performance.now() - started),
      };
      patchLast((turn) => ({ ...turn, receipt }));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        patchLast((turn) => ({
          ...turn,
          error: (err as Error).message || 'Something went wrong.',
        }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(index: number, receiptId: string) {
    setTurns((prev) =>
      prev.map((t, i) => (i === index ? { ...t, verification: { state: 'loading' } } : t)),
    );
    try {
      const res = await fetch(`/api/playground/receipts/${encodeURIComponent(receiptId)}`);
      if (!res.ok) throw new Error();
      const { summary } = (await res.json()) as { summary: Omit<Verification, 'state'> };
      setTurns((prev) =>
        prev.map((t, i) =>
          i === index ? { ...t, verification: { state: 'done', ...summary } } : t,
        ),
      );
    } catch {
      setTurns((prev) =>
        prev.map((t, i) => (i === index ? { ...t, verification: { state: 'error' } } : t)),
      );
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-40px_rgba(14,23,38,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div
          role="radiogroup"
          aria-label="Model"
          className="inline-flex rounded-lg bg-surface-2 p-1"
        >
          {PLAYGROUND.models.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={model === m}
              onClick={() => setModel(m)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${model === m ? 'bg-surface font-medium shadow-sm' : 'text-ink-2 hover:text-ink'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="hidden sm:inline">{MODEL_ALIASES[model].description.split(',')[0]}</span>
          <span className="rounded-full border border-verified/30 bg-verified-soft px-2 py-0.5 font-medium text-verified">
            ● Nothing you type is stored
          </span>
        </div>
      </div>

      <div
        ref={scroller}
        className="h-[26rem] space-y-5 overflow-y-auto px-4 py-5 sm:px-6"
        aria-live="polite"
      >
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-display text-3xl">Ask it something you&rsquo;d ask at work.</p>
            <p className="mt-2 max-w-md text-sm text-muted">
              Your question goes from this page straight to our gateway and on to a model in a
              hardware enclave. The answer comes back with a receipt you can check.
            </p>
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-left text-sm text-ink-2 transition hover:border-seal hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] whitespace-pre-wrap text-paper">
                  {turn.content}
                </p>
              </div>
            ) : (
              <div key={i} className="max-w-[95%]">
                {turn.error ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
                  >
                    {turn.error}
                  </p>
                ) : turn.content ? (
                  <>
                    <MarkdownLite text={turn.content} />
                    {busy && i === turns.length - 1 ? <span className="caret" aria-hidden /> : null}
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    Sealing your request
                    <span className="caret" aria-hidden />
                  </p>
                )}
                {turn.receipt ? (
                  <ReceiptStrip
                    receipt={turn.receipt}
                    verification={turn.verification}
                    onVerify={() => turn.receipt?.id && verify(i, turn.receipt.id)}
                  />
                ) : null}
              </div>
            ),
          )
        )}
      </div>

      <form
        className="border-t border-line bg-paper/60 p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-2 focus-within:border-seal">
          <label htmlFor="playground-input" className="sr-only">
            Ask a coding question
          </label>
          <textarea
            id="playground-input"
            rows={2}
            maxLength={8_000}
            value={input}
            disabled={remaining === 0}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={
              remaining === 0
                ? 'Session limit reached. Contact us to set up a pilot on your own code.'
                : 'Ask a coding question… (Enter to send)'
            }
            className="min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] placeholder:text-muted focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="h-10 rounded-lg border border-line-strong px-4 text-sm"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || remaining === 0}
              className="h-10 rounded-lg bg-seal px-4 text-sm font-medium text-white disabled:opacity-40 dark:text-[#140a05]"
            >
              Send
            </button>
          )}
        </div>
        <p className="mt-2 flex flex-wrap justify-between gap-2 px-1 text-xs text-muted">
          <span>
            {remaining} of {PLAYGROUND.maxRequestsPerToken} requests left this session · answers
            capped at {PLAYGROUND.maxOutputTokens} tokens
          </span>
          <span>No tools here: a pilot connects Claude Code to your repo.</span>
        </p>
      </form>
    </div>
  );
}

function ReceiptStrip({
  receipt,
  verification,
  onVerify,
}: {
  receipt: Receipt;
  verification?: Verification;
  onVerify: () => void;
}) {
  return (
    <div className="receipt-edge mt-3 rounded-t-lg border border-b-0 border-line bg-paper px-4 pt-3 font-mono text-[11.5px] text-ink-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="font-semibold tracking-wider text-ink">RECEIPT</span>
        <span className="truncate">{receipt.id ?? 'no receipt id'}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
        <span>model {receipt.model}</span>
        <span>
          tokens {receipt.inputTokens}→{receipt.outputTokens}
        </span>
        <span>first token {receipt.ttftMs ?? '—'} ms</span>
        <span>total {receipt.totalMs} ms</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-line-strong pt-2">
        {!verification ? (
          receipt.id ? (
            <button
              type="button"
              onClick={onVerify}
              className="font-sans text-xs font-medium text-seal hover:underline"
            >
              Verify this receipt →
            </button>
          ) : null
        ) : verification.state === 'loading' ? (
          <span>checking with Phala&rsquo;s attested gateway…</span>
        ) : verification.state === 'error' ? (
          <span className="text-danger">
            Couldn&rsquo;t fetch the receipt.{' '}
            <button type="button" onClick={onVerify} className="underline">
              Retry
            </button>
          </span>
        ) : (
          <>
            <span className={verification.verified ? 'text-verified' : 'text-danger'}>
              {verification.verified ? '✓ upstream.verified' : '✗ not verified'}
              {verification.required ? ' · required' : ''}
            </span>
            <span>provider {verification.provider ?? '—'}</span>
            <span>model {verification.modelId ?? '—'}</span>
            <span>{verification.signed ? 'signed' : 'unsigned'}</span>
          </>
        )}
      </div>
    </div>
  );
}
