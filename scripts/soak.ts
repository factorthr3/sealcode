/**
 * Soak test: N concurrent sessions, each sending streamed requests back to back for a set time.
 * A stream counts as dropped if it ends without message_stop, errors mid-stream or returns a 5xx.
 * The launch criterion is 24 hours at 20 sessions with zero drops.
 *
 *   SOAK_URL=http://localhost:8787 SOAK_KEY=sc_live_… SOAK_SESSIONS=20 SOAK_MINUTES=5 pnpm soak
 */
const url = (process.env.SOAK_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const key = process.env.SOAK_KEY;
const sessions = Number(process.env.SOAK_SESSIONS ?? 20);
const minutes = Number(process.env.SOAK_MINUTES ?? 5);
const model = process.env.SOAK_MODEL ?? 'sealcode-fast';
if (!key) {
  console.error('Set SOAK_KEY to a key on a dedicated test organisation.');
  process.exit(2);
}

const deadline = Date.now() + minutes * 60_000;
const stats = { ok: 0, dropped: 0, throttled: 0, errors: 0, latencies: [] as number[] };
const PROMPTS = [
  'Write a unit test for a date parser.',
  'Explain this regex: ^\\d{3}-\\d{4}$',
  'Refactor a nested if into a lookup table.',
];

async function once(i: number): Promise<void> {
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(`${url}/v1/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        stream: true,
        messages: [{ role: 'user', content: PROMPTS[i % PROMPTS.length] }],
      }),
      signal: AbortSignal.timeout(300_000),
    });
  } catch {
    stats.errors++;
    return;
  }
  if (res.status === 429) {
    stats.throttled++;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 1) * 1000));
    return;
  }
  if (!res.ok || !res.body) {
    stats[res.status >= 500 ? 'dropped' : 'errors']++;
    await res.body?.cancel();
    return;
  }
  let text = '';
  try {
    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>)
      text += decoder.decode(chunk, { stream: true });
  } catch {
    stats.dropped++;
    return;
  }
  if (text.includes('event: message_stop')) {
    stats.ok++;
    stats.latencies.push(performance.now() - started);
  } else {
    stats.dropped++;
  }
}

async function session(id: number) {
  let i = id;
  while (Date.now() < deadline) await once(i++);
}

const progress = setInterval(() => {
  const left = Math.max(0, Math.round((deadline - Date.now()) / 60_000));
  console.log(
    `${new Date().toISOString()} ok=${stats.ok} dropped=${stats.dropped} throttled=${stats.throttled} errors=${stats.errors} (${left} min left)`,
  );
}, 60_000);

await Promise.all(Array.from({ length: sessions }, (_, i) => session(i)));
clearInterval(progress);
const sorted = [...stats.latencies].sort((a, b) => a - b);
const p = (q: number) =>
  Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
console.log(`\n${sessions} sessions for ${minutes} min against ${url}`);
console.log(
  `completed ${stats.ok}, dropped ${stats.dropped}, throttled ${stats.throttled}, other errors ${stats.errors}`,
);
console.log(`stream duration p50 ${p(0.5)} ms, p99 ${p(0.99)} ms`);
console.log(stats.dropped === 0 && stats.errors === 0 ? 'PASS: zero dropped streams' : 'FAIL');
process.exit(stats.dropped === 0 && stats.errors === 0 ? 0 : 1);
