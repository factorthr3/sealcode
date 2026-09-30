/**
 * Milestone 1 latency check: added latency under 20 ms at p50 and 100 ms at p99, with 50
 * concurrent streams. Runs the mock upstream and the gateway on real sockets and compares time to
 * first byte and to the end of the stream, direct versus through the gateway.
 *
 *   pnpm bench            # 10 rounds of 50 concurrent streams
 *   BENCH_ROUNDS=40 pnpm bench
 */
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { createLogger } from '@sealcode/shared/logger';
import { generateApiKey, hashApiKey } from '@sealcode/shared/node';
import { createGateway, DEFAULT_CONFIG } from '../apps/gateway/src/app';
import { MemoryStore } from '../apps/gateway/src/store';
import { createMockUpstream } from '../apps/gateway/mock/upstream';

const CONCURRENCY = 50;
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 10);
const PEPPER = 'bench-pepper-0123456789abcdef0123456789abcdef';

function listen(handler: (req: Request) => Response | Promise<Response>): Promise<string> {
  return new Promise((resolve) => {
    serve({ fetch: handler, port: 0, hostname: '127.0.0.1' }, (info: AddressInfo) =>
      resolve(`http://127.0.0.1:${info.port}`),
    );
  });
}

const mock = createMockUpstream({ chunkDelayMs: 1 });
const upstream = await listen(mock.app.fetch);
const store = new MemoryStore();
const { key } = generateApiKey();
store.addKey(hashApiKey(key, PEPPER), {
  keyId: 'bench',
  orgId: 'bench',
  userId: 'bench',
  revoked: false,
  orgStatus: 'active',
  plan: 'enterprise',
  trialEndsAt: null,
  rateLimitRpm: 1_000_000,
  budgetMode: 'soft',
  orgBudgetTokens: null,
  seatBudgetTokens: null,
});
const gateway = await listen(
  createGateway({
    store,
    logger: createLogger({ component: 'gateway', level: 'error', sink: () => undefined }),
    config: {
      ...DEFAULT_CONFIG,
      upstreamBaseUrl: upstream,
      upstreamApiKey: 'mock-phala-key',
      keyPepper: PEPPER,
    },
  }).fetch,
);

const body = (model: string) =>
  JSON.stringify({
    model,
    max_tokens: 512,
    stream: true,
    messages: [{ role: 'user', content: 'Write tests for the fee calculator.' }],
    provider: { aci_verified: true, zdr: true },
  });

async function one(url: string, auth: string, model: string) {
  const start = performance.now();
  const res = await fetch(`${url}/v1/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth}`,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: body(model),
  });
  const reader = res.body!.getReader();
  let first = 0;
  for (;;) {
    const { done } = await reader.read();
    if (!first) first = performance.now() - start;
    if (done) break;
  }
  return { ttfb: first, total: performance.now() - start, status: res.status };
}

const pct = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

const direct = { ttfb: [] as number[], total: [] as number[] };
const via = { ttfb: [] as number[], total: [] as number[] };
// Warm up connections and JIT.
await Promise.all(Array.from({ length: 10 }, () => one(gateway, key, 'sealcode-pro')));
for (let round = 0; round < ROUNDS; round++) {
  const d = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => one(upstream, 'mock-phala-key', 'z-ai/glm-5.3')),
  );
  const g = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => one(gateway, key, 'sealcode-pro')),
  );
  if (g.some((r) => r.status !== 200)) throw new Error('gateway returned a non-200 status');
  for (const r of d) {
    direct.ttfb.push(r.ttfb);
    direct.total.push(r.total);
  }
  for (const r of g) {
    via.ttfb.push(r.ttfb);
    via.total.push(r.total);
  }
}

const row = (label: string, a: number[], b: number[]) => {
  const p50 = pct(b, 50) - pct(a, 50);
  const p99 = pct(b, 99) - pct(a, 99);
  console.log(
    `${label.padEnd(18)} direct p50 ${pct(a, 50).toFixed(1)} ms, p99 ${pct(a, 99).toFixed(1)} ms | ` +
      `gateway p50 ${pct(b, 50).toFixed(1)} ms, p99 ${pct(b, 99).toFixed(1)} ms | added p50 ${p50.toFixed(1)} ms, p99 ${p99.toFixed(1)} ms`,
  );
  return { p50, p99 };
};

console.log(
  `${ROUNDS} rounds x ${CONCURRENCY} concurrent streams (${ROUNDS * CONCURRENCY} per side)\n`,
);
const first = row('time to first byte', direct.ttfb, via.ttfb);
const whole = row('whole stream', direct.total, via.total);
const pass = first.p50 < 20 && first.p99 < 100 && whole.p50 < 20 && whole.p99 < 100;
console.log(
  `\n${pass ? 'PASS' : 'FAIL'}: target is added latency under 20 ms at p50 and 100 ms at p99`,
);
process.exit(pass ? 0 : 1);
