import { createLogger } from '@sealcode/shared/logger';
import { generateApiKey, hashApiKey, signPlaygroundToken } from '@sealcode/shared/node';
import { createGateway, DEFAULT_CONFIG, type GatewayConfig } from '../src/app';
import { MemoryStore, type KeyContext } from '../src/store';
import { createMockUpstream, type MockUpstreamOptions } from '../mock/upstream';

export const PEPPER = 'test-pepper-0123456789abcdef0123456789abcdef';
export const PLAYGROUND_SECRET = 'test-playground-secret-0123456789abcdef012345';
export const SITE_ORIGIN = 'http://site.test';

/** Prompt and system text that must never appear in any log line or process output. */
export const PROMPT = 'FIXTURE_PROMPT_7f3a9c please refactor the settlement reconciliation job';
export const SYSTEM = 'FIXTURE_SYSTEM_c41e you are reviewing a confidential payments codebase';
export const FORBIDDEN = [
  'FIXTURE_PROMPT_7f3a9c',
  'FIXTURE_SYSTEM_c41e',
  'MOCK_COMPLETION_TEXT',
  'formatGBP',
  'sc_live_',
  'sc_demo_',
];

/** Every log line written by any gateway in this worker, scanned after each test file. */
export const capturedLogLines: string[] = [];

export const defaultKeyContext: KeyContext = {
  keyId: 'key_1',
  orgId: 'org_1',
  userId: 'user_1',
  revoked: false,
  orgStatus: 'active',
  plan: 'team',
  trialEndsAt: null,
  rateLimitRpm: 120,
  budgetMode: 'soft',
  orgBudgetTokens: 60_000_000,
  seatBudgetTokens: null,
};

export function setup(
  opts: {
    ctx?: Partial<KeyContext>;
    config?: Partial<GatewayConfig>;
    mock?: MockUpstreamOptions;
    upstreamDown?: boolean;
  } = {},
) {
  const mock = createMockUpstream(opts.mock);
  const store = new MemoryStore();
  const { key } = generateApiKey();
  const ctx = { ...defaultKeyContext, ...opts.ctx };
  store.addKey(hashApiKey(key, PEPPER), ctx);
  const lines: string[] = [];
  const logger = createLogger({
    component: 'gateway',
    level: 'debug',
    sink: (l) => {
      lines.push(l);
      capturedLogLines.push(l);
    },
  });
  let clock = Date.UTC(2026, 9, 15, 12, 0, 0);
  const upstreamFetch: typeof fetch = async (input, init) => {
    if (opts.upstreamDown) throw new TypeError('fetch failed');
    return mock.app.fetch(new Request(input as string, init));
  };
  const config: GatewayConfig = {
    ...DEFAULT_CONFIG,
    upstreamBaseUrl: 'http://upstream.test',
    upstreamApiKey: 'mock-phala-key',
    keyPepper: PEPPER,
    playgroundSecret: PLAYGROUND_SECRET,
    playgroundOrigin: SITE_ORIGIN,
    siteUrl: 'https://sealcode.dev',
    ...opts.config,
  };
  const app = createGateway({ store, logger, config, fetch: upstreamFetch, now: () => clock });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  return {
    app,
    mock,
    store,
    key,
    ctx,
    lines,
    config,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    messages: (body: unknown, headers: Record<string, string> = {}) =>
      post('/v1/messages', body, {
        authorization: `Bearer ${key}`,
        'anthropic-version': '2023-06-01',
        ...headers,
      }),
    chat: (body: unknown, headers: Record<string, string> = {}) =>
      post('/v1/chat/completions', body, { authorization: `Bearer ${key}`, ...headers }),
    post,
    playgroundToken: (ttl = 900) => signPlaygroundToken(PLAYGROUND_SECRET, ttl, clock).token,
  };
}

export function messageBody(extra: Record<string, unknown> = {}) {
  return {
    model: 'sealcode-pro',
    max_tokens: 256,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: PROMPT }],
    ...extra,
  };
}

export function lastUpstream(mock: ReturnType<typeof createMockUpstream>) {
  const r = mock.requests.at(-1);
  if (!r) throw new Error('no upstream request');
  return r;
}

export function fixture(name: string): string {
  return `MOCK_FIXTURE:${name} ${PROMPT}`;
}
