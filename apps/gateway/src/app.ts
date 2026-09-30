import { Hono, type Context } from 'hono';
import {
  anthropicError,
  formatTokens,
  MODEL_ALIAS_IDS,
  MODEL_ALIASES,
  openaiError,
  PLAYGROUND,
  resolveModelAlias,
  SALES_EMAIL,
  STATUS_FOR_ERROR,
  SUPPORT_EMAIL,
  totalTokens,
  upstreamModelFor,
  ZERO_USAGE,
  type AnthropicErrorType,
  type GatewayRefusal,
  type ModelAliasId,
  type TokenUsage,
} from '@sealcode/shared';
import { errorFields, type Logger } from '@sealcode/shared/logger';
import {
  API_KEY_PREFIX,
  hashApiKey,
  isApiKeyFormat,
  newRequestId,
  PLAYGROUND_TOKEN_PREFIX,
  verifyPlaygroundToken,
} from '@sealcode/shared/node';
import { RateLimiter, TtlCache } from './limits';
import { UsageMeter, type WireFormat } from './meter';
import {
  dayOf,
  periodOf,
  secondsUntilPeriodEnd,
  type Endpoint,
  type GatewayStore,
  type KeyContext,
  type MonthUsage,
} from './store';

export interface GatewayConfig {
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  keyPepper: string;
  playgroundSecret: string | null;
  playgroundOrigin: string | null;
  siteUrl: string;
  maxBodyBytes: number;
  /** Key lookups are cached this long, so a revoked key stops working within it. */
  keyCacheMs: number;
  usageCacheMs: number;
}

export const DEFAULT_CONFIG: Omit<
  GatewayConfig,
  'upstreamBaseUrl' | 'upstreamApiKey' | 'keyPepper'
> = {
  playgroundSecret: null,
  playgroundOrigin: null,
  siteUrl: 'https://sealcode.dev',
  maxBodyBytes: 32 * 1024 * 1024,
  keyCacheMs: 3_000,
  usageCacheMs: 2_000,
};

export interface GatewayDeps {
  store: GatewayStore;
  logger: Logger;
  config: GatewayConfig;
  now?: () => number;
  fetch?: typeof fetch;
}

type Principal =
  { kind: 'key'; ctx: KeyContext } | { kind: 'playground'; jti: string; exp: number };

type AuthResult =
  | { ok: true; principal: Principal }
  | { ok: false; type: AnthropicErrorType; message: string; refusal: GatewayRefusal };

/** Response headers relayed from the upstream; everything else is dropped. */
const RELAYED_RESPONSE_HEADERS = [
  'content-type',
  'retry-after',
  'x-should-retry',
  'x-receipt-id',
  'x-aci-identity',
  'x-aci-keyset-digest',
];
const ALLOWED_BROWSER_HEADERS =
  'content-type, x-api-key, authorization, anthropic-version, anthropic-dangerous-direct-browser-access';
const EXPOSED_HEADERS = 'x-receipt-id, x-sealcode-request-id, retry-after';

export function createGateway(deps: GatewayDeps): Hono {
  const { store, logger, config: cfg } = deps;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetch ?? fetch;
  const limiter = new RateLimiter();
  const keyCache = new TtlCache<KeyContext | null>(cfg.keyCacheMs);
  // Concurrent requests for the same key share one lookup, so a burst can't fan out to the database.
  const keyLookups = new Map<string, Promise<KeyContext | null>>();
  const usageLookups = new Map<string, Promise<MonthUsage>>();
  const usageCache = new TtlCache<MonthUsage>(cfg.usageCacheMs);
  const playgroundCounts = new Map<string, { count: number; exp: number }>();
  const playgroundDaily = new TtlCache<number>(10_000);
  const lastTouched = new Map<string, number>();
  let lastSweep = now();

  const app = new Hono();

  // --- CORS, only for the marketing site's playground -------------------------------------------
  app.use('/v1/*', async (c, next) => {
    const origin = c.req.header('origin');
    const allowed = !!origin && !!cfg.playgroundOrigin && origin === cfg.playgroundOrigin;
    if (c.req.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': ALLOWED_BROWSER_HEADERS,
          'access-control-max-age': '600',
          vary: 'origin',
        },
      });
    }
    await next();
    if (allowed) {
      c.res.headers.set('access-control-allow-origin', origin);
      c.res.headers.set('access-control-expose-headers', EXPOSED_HEADERS);
      c.res.headers.append('vary', 'origin');
    }
  });

  // --- helpers -----------------------------------------------------------------------------------
  function errorResponse(
    format: WireFormat,
    type: AnthropicErrorType,
    message: string,
    requestId: string,
    opts: { status?: number; headers?: Record<string, string>; code?: string } = {},
  ): Response {
    const body =
      format === 'anthropic'
        ? anthropicError(type, message, requestId)
        : openaiError(type, message, opts.code ?? null);
    return new Response(JSON.stringify(body), {
      status: opts.status ?? STATUS_FOR_ERROR[type],
      headers: {
        'content-type': 'application/json',
        'x-sealcode-request-id': requestId,
        ...opts.headers,
      },
    });
  }

  function credential(headers: Headers): string | null {
    const apiKey = headers.get('x-api-key')?.trim();
    const bearer = headers.get('authorization')?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
    const candidates = [apiKey, bearer].filter((v): v is string => !!v);
    return (
      candidates.find(
        (v) => v.startsWith(API_KEY_PREFIX) || v.startsWith(PLAYGROUND_TOKEN_PREFIX),
      ) ??
      candidates[0] ??
      null
    );
  }

  async function authenticate(headers: Headers, at: number): Promise<AuthResult> {
    const token = credential(headers);
    if (!token) {
      return {
        ok: false,
        type: 'authentication_error',
        message:
          'Missing API key. Run `npx sealcode login`, or set ANTHROPIC_AUTH_TOKEN to your sc_live_ key.',
        refusal: 'missing_key',
      };
    }
    if (token.startsWith(PLAYGROUND_TOKEN_PREFIX)) {
      const payload = cfg.playgroundSecret
        ? verifyPlaygroundToken(token, cfg.playgroundSecret, at)
        : null;
      if (!payload) {
        return {
          ok: false,
          type: 'authentication_error',
          message: 'This playground session has expired. Refresh the page to start a new one.',
          refusal: 'invalid_key',
        };
      }
      return { ok: true, principal: { kind: 'playground', jti: payload.jti, exp: payload.exp } };
    }
    if (!isApiKeyFormat(token)) {
      return {
        ok: false,
        type: 'authentication_error',
        message: 'Invalid API key.',
        refusal: 'invalid_key',
      };
    }
    const hash = hashApiKey(token, cfg.keyPepper);
    let ctx = keyCache.get(hash, at);
    if (ctx === undefined) {
      let pending = keyLookups.get(hash);
      if (!pending) {
        pending = store.findKey(hash).finally(() => keyLookups.delete(hash));
        keyLookups.set(hash, pending);
      }
      ctx = await pending;
      keyCache.set(hash, ctx, at);
    }
    if (!ctx) {
      return {
        ok: false,
        type: 'authentication_error',
        message: 'Invalid API key.',
        refusal: 'invalid_key',
      };
    }
    if (ctx.revoked) {
      return {
        ok: false,
        type: 'authentication_error',
        message: 'This API key has been revoked. Run `npx sealcode login` to create a new one.',
        refusal: 'revoked_key',
      };
    }
    return { ok: true, principal: { kind: 'key', ctx } };
  }

  async function readJsonBody(
    req: Request,
    limit: number,
  ): Promise<Record<string, unknown> | 'too_large' | 'invalid'> {
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) return 'too_large';
    if (!req.body) return 'invalid';
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return 'too_large';
      }
      chunks.push(value);
    }
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : 'invalid';
    } catch {
      return 'invalid';
    }
  }

  async function monthUsage(ctx: KeyContext, at: number): Promise<MonthUsage> {
    const period = periodOf(new Date(at));
    const cacheKey = `${ctx.orgId}:${ctx.userId}:${period}`;
    const cached = usageCache.get(cacheKey, at);
    if (cached) return cached;
    let pending = usageLookups.get(cacheKey);
    if (!pending) {
      pending = store
        .getMonthUsage(ctx.orgId, ctx.userId, period)
        .finally(() => usageLookups.delete(cacheKey));
      usageLookups.set(cacheKey, pending);
    }
    const fresh = await pending;
    usageCache.set(cacheKey, fresh, at);
    return fresh;
  }

  async function playgroundTokensToday(at: number): Promise<number> {
    const day = dayOf(new Date(at));
    const cached = playgroundDaily.get(day, at);
    if (cached !== undefined) return cached;
    const fresh = await store.playgroundTokensToday(day);
    playgroundDaily.set(day, fresh, at);
    return fresh;
  }

  function sweep(at: number): void {
    if (at - lastSweep < 60_000) return;
    lastSweep = at;
    limiter.sweep(at);
    for (const [jti, s] of playgroundCounts) if (s.exp * 1000 < at) playgroundCounts.delete(jti);
  }

  function budgetExhausted(ctx: KeyContext, usage: MonthUsage, at: number): string | null {
    const hardStop = ctx.plan === 'trial' || ctx.budgetMode === 'hard';
    if (!hardStop) return null;
    const resets = new Date(
      Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth() + 1, 1),
    )
      .toISOString()
      .slice(0, 10);
    if (ctx.orgBudgetTokens !== null && usage.orgTokens >= ctx.orgBudgetTokens) {
      return ctx.plan === 'trial'
        ? `Your Sealcode trial has used its ${formatTokens(ctx.orgBudgetTokens)} token allowance. Email ${SALES_EMAIL} or visit ${cfg.siteUrl}/contact to activate a plan.`
        : `Your organisation has reached its monthly token budget of ${formatTokens(ctx.orgBudgetTokens)}. An admin can raise it at ${cfg.siteUrl}/app/budgets. It resets on ${resets}.`;
    }
    if (ctx.seatBudgetTokens !== null && usage.seatTokens >= ctx.seatBudgetTokens) {
      return `You have reached your monthly seat budget of ${formatTokens(ctx.seatBudgetTokens)}. Ask an admin to raise it at ${cfg.siteUrl}/app/budgets. It resets on ${resets}.`;
    }
    return null;
  }

  // --- the inference pipeline --------------------------------------------------------------------
  async function inference(c: Context, endpoint: Endpoint): Promise<Response> {
    const format: WireFormat = endpoint === 'messages' ? 'anthropic' : 'openai';
    const route = endpoint === 'messages' ? '/v1/messages' : '/v1/chat/completions';
    const requestId = newRequestId();
    const started = now();
    sweep(started);

    const auth = await authenticate(c.req.raw.headers, started);
    if (!auth.ok) {
      logger.info('request.refused', {
        request_id: requestId,
        route,
        status: 401,
        refusal: auth.refusal,
      });
      return errorResponse(format, auth.type, auth.message, requestId);
    }
    const principal = auth.principal;
    const keyCtx = principal.kind === 'key' ? principal.ctx : null;
    const isPlayground = principal.kind === 'playground';

    let alias: ModelAliasId | null = null;
    let finalized = false;

    /** Record the request once: audit row, usage counters and one metadata log line. */
    const finalize = (outcome: {
      status: number;
      usage?: TokenUsage;
      errorType?: string | null;
      refusal?: GatewayRefusal;
      receiptId?: string | null;
      ttfbMs?: number | null;
      stream?: boolean;
      aborted?: boolean;
    }) => {
      if (finalized) return;
      finalized = true;
      const at = now();
      const usage = outcome.usage ?? ZERO_USAGE;
      const tokens = totalTokens(usage);
      logger.info('request.completed', {
        request_id: requestId,
        route,
        org_id: keyCtx?.orgId,
        key_id: keyCtx?.keyId,
        model: alias,
        upstream_model: alias ? upstreamModelFor(alias) : null,
        status: outcome.status,
        refusal: outcome.refusal,
        error_type: outcome.errorType ?? null,
        latency_ms: at - started,
        ttfb_ms: outcome.ttfbMs ?? null,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_tokens: usage.cacheReadTokens,
        cache_write_tokens: usage.cacheWriteTokens,
        receipt_id: outcome.receiptId ?? null,
        stream: outcome.stream ?? false,
        aborted: outcome.aborted ?? false,
        playground: isPlayground,
      });
      if (keyCtx) {
        const createdAt = new Date(started);
        store
          .recordUsage({
            requestId,
            orgId: keyCtx.orgId,
            userId: keyCtx.userId,
            keyId: keyCtx.keyId,
            endpoint,
            modelAlias: alias,
            upstreamModel: alias ? upstreamModelFor(alias) : null,
            usage,
            status: outcome.status,
            errorType: outcome.refusal ?? outcome.errorType ?? null,
            latencyMs: at - started,
            ttfbMs: outcome.ttfbMs ?? null,
            receiptId: outcome.receiptId ?? null,
            stream: outcome.stream ?? false,
            createdAt,
          })
          .catch((err: unknown) =>
            logger.error('usage.record_failed', { request_id: requestId, ...errorFields(err) }),
          );
        if (tokens > 0) {
          usageCache.update(`${keyCtx.orgId}:${keyCtx.userId}:${periodOf(createdAt)}`, (u) => ({
            orgTokens: u.orgTokens + tokens,
            seatTokens: u.seatTokens + tokens,
          }));
        }
        if (at - (lastTouched.get(keyCtx.keyId) ?? 0) > 60_000) {
          lastTouched.set(keyCtx.keyId, at);
          store.touchKey(keyCtx.keyId, new Date(at)).catch(() => undefined);
        }
      } else if (tokens > 0) {
        const day = dayOf(new Date(started));
        playgroundDaily.update(day, (t) => t + tokens);
        store
          .recordPlaygroundUsage(day, tokens)
          .catch((err: unknown) => logger.error('playground.record_failed', errorFields(err)));
      }
    };

    const refuse = (
      type: AnthropicErrorType,
      message: string,
      refusal: GatewayRefusal,
      headers?: Record<string, string>,
    ): Response => {
      const res = errorResponse(format, type, message, requestId, { headers });
      finalize({ status: res.status, refusal });
      return res;
    };

    // Org state.
    if (keyCtx) {
      if (keyCtx.orgStatus === 'suspended') {
        return refuse(
          'permission_error',
          `Your Sealcode organisation is suspended. Contact ${SUPPORT_EMAIL}.`,
          'org_inactive',
        );
      }
      if (
        keyCtx.orgStatus === 'trial' &&
        keyCtx.trialEndsAt &&
        keyCtx.trialEndsAt.getTime() <= started
      ) {
        return refuse(
          'permission_error',
          `Your Sealcode trial ended on ${keyCtx.trialEndsAt.toISOString().slice(0, 10)}. Email ${SALES_EMAIL} or visit ${cfg.siteUrl}/contact to activate a plan.`,
          'trial_expired',
        );
      }
    }

    // Body and model.
    const body = await readJsonBody(
      c.req.raw,
      isPlayground ? PLAYGROUND.maxRequestBytes : cfg.maxBodyBytes,
    );
    if (body === 'too_large')
      return refuse('request_too_large', 'Request body is too large.', 'body_too_large');
    if (body === 'invalid') {
      return refuse('invalid_request_error', 'Request body must be a JSON object.', 'invalid_body');
    }
    alias = resolveModelAlias(body.model);
    if (!alias) {
      const requested =
        typeof body.model === 'string' ? JSON.stringify(body.model.slice(0, 80)) : 'missing';
      return refuse(
        'not_found_error',
        `Unknown model ${requested}. Use ${MODEL_ALIAS_IDS.join(' or ')}.`,
        'unknown_model',
      );
    }
    const stream = body.stream === true;

    // Limits.
    if (principal.kind === 'playground') {
      if (!(PLAYGROUND.models as readonly string[]).includes(alias)) {
        return refuse(
          'invalid_request_error',
          'This model is not available in the playground.',
          'playground_limit',
        );
      }
      if (Array.isArray(body.tools) && body.tools.length > 0) {
        return refuse(
          'invalid_request_error',
          'Tools are not available in the playground. Start a free trial to use Sealcode with Claude Code.',
          'playground_limit',
        );
      }
      const state = playgroundCounts.get(principal.jti) ?? { count: 0, exp: principal.exp };
      if (state.count >= PLAYGROUND.maxRequestsPerToken) {
        return refuse(
          'rate_limit_error',
          'This playground session has used all its requests. Refresh the page for another, or start a free trial.',
          'playground_limit',
          { 'retry-after': '120', 'x-should-retry': 'false' },
        );
      }
      const rate = limiter.take(`pg:${principal.jti}`, PLAYGROUND.requestsPerMinute, started);
      if (!rate.ok) {
        return refuse(
          'rate_limit_error',
          'Slow down a little: the playground allows a few requests a minute.',
          'rate_limited',
          {
            'retry-after': String(rate.retryAfter),
          },
        );
      }
      if ((await playgroundTokensToday(started)) >= PLAYGROUND.dailyTokenCap) {
        return refuse(
          'rate_limit_error',
          `The playground has reached today's capacity. Start a free trial at ${cfg.siteUrl}/signup to keep going.`,
          'playground_limit',
          { 'retry-after': '3600', 'x-should-retry': 'false' },
        );
      }
      state.count += 1;
      playgroundCounts.set(principal.jti, state);
      for (const field of ['max_tokens', 'max_completion_tokens']) {
        const value = body[field];
        if (field === 'max_tokens' || value !== undefined) {
          body[field] =
            typeof value === 'number' && value > 0
              ? Math.min(value, PLAYGROUND.maxOutputTokens)
              : PLAYGROUND.maxOutputTokens;
        }
      }
    } else if (keyCtx) {
      const rate = limiter.take(keyCtx.keyId, keyCtx.rateLimitRpm, started);
      if (!rate.ok) {
        return refuse(
          'rate_limit_error',
          `Rate limit reached: ${keyCtx.rateLimitRpm} requests per minute for this key.`,
          'rate_limited',
          { 'retry-after': String(rate.retryAfter) },
        );
      }
      const exhausted = budgetExhausted(keyCtx, await monthUsage(keyCtx, started), started);
      if (exhausted) {
        return refuse(
          'rate_limit_error',
          exhausted,
          keyCtx.orgBudgetTokens !== null ? 'org_budget_exhausted' : 'seat_budget_exhausted',
          // Above 60 seconds, Claude Code shows the message at once instead of retrying.
          {
            'retry-after': String(secondsUntilPeriodEnd(new Date(started))),
            'x-should-retry': 'false',
          },
        );
      }
    }

    // Build the upstream request. Only `model` and `provider` change; every other field is
    // forwarded as sent. The client's own `provider` is discarded: routing is always TEE-only.
    const upstreamModel = upstreamModelFor(alias);
    const { provider: _clientProvider, ...fields } = body;
    const upstreamBody: Record<string, unknown> = {
      ...fields,
      model: upstreamModel,
      provider: { aci_verified: true, ...(MODEL_ALIASES[alias].zdr ? { zdr: true } : {}) },
    };
    let dropUsageOnlyChunks = false;
    if (format === 'openai' && stream) {
      const options = (body.stream_options ?? {}) as Record<string, unknown>;
      dropUsageOnlyChunks = options.include_usage !== true;
      upstreamBody.stream_options = { ...options, include_usage: true };
    }

    const headers = new Headers({
      authorization: `Bearer ${cfg.upstreamApiKey}`,
      'content-type': 'application/json',
      accept: stream ? 'text/event-stream' : 'application/json',
      'user-agent': 'sealcode-gateway',
    });
    if (format === 'anthropic') {
      for (const [name, value] of c.req.raw.headers) {
        if (name.startsWith('anthropic-') && name !== 'anthropic-dangerous-direct-browser-access') {
          headers.set(name, value);
        }
      }
    }

    const abort = new AbortController();
    c.req.raw.signal?.addEventListener('abort', () => abort.abort(), { once: true });
    let upstream: Response;
    try {
      upstream = await fetchImpl(`${cfg.upstreamBaseUrl}${route}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(upstreamBody),
        signal: abort.signal,
      });
    } catch (err) {
      logger.warn('upstream.unreachable', { request_id: requestId, ...errorFields(err) });
      const res = errorResponse(
        format,
        'api_error',
        'The upstream confidential inference gateway is unavailable. Please retry.',
        requestId,
        { status: 502 },
      );
      finalize({ status: 502, refusal: 'upstream_unavailable' });
      return res;
    }

    const ttfbMs = now() - started;
    const receiptId = upstream.headers.get('x-receipt-id');
    const outHeaders = new Headers({ 'x-sealcode-request-id': requestId });
    for (const [name, value] of upstream.headers) {
      if (RELAYED_RESPONSE_HEADERS.includes(name) || name.startsWith('anthropic-ratelimit-')) {
        outHeaders.set(name, value);
      }
    }

    // Upstream errors pass through unchanged: Claude Code's recovery matches on their wording.
    if (!upstream.ok) {
      const text = await upstream.text();
      finalize({
        status: upstream.status,
        errorType: errorTypeOf(text),
        receiptId,
        ttfbMs,
        stream,
      });
      return new Response(text, { status: upstream.status, headers: outHeaders });
    }

    const meter = new UsageMeter({ format, upstreamModel, alias, dropUsageOnlyChunks });
    const isSse = (upstream.headers.get('content-type') ?? '').includes('text/event-stream');
    if (!isSse || !upstream.body) {
      const text = await upstream.text();
      meter.readJson(text);
      finalize({ status: upstream.status, usage: meter.usage, receiptId, ttfbMs, stream: false });
      return new Response(meter.rewrite(text), { status: upstream.status, headers: outHeaders });
    }

    outHeaders.set('cache-control', 'no-cache');
    outHeaders.set('x-accel-buffering', 'no');
    const reader = upstream.body.getReader();
    const status = upstream.status;
    let cancelled = false;
    const relay = new ReadableStream<Uint8Array>({
      // Each pull reads until it has bytes to hand on: a pull that enqueues nothing stalls the
      // stream, and a chunk can hold only part of an event.
      async pull(controller) {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (cancelled) return;
            if (done) {
              const tail = meter.flush();
              if (tail.byteLength) controller.enqueue(tail);
              controller.close();
              finalize({ status, usage: meter.usage, receiptId, ttfbMs, stream: true });
              return;
            }
            const out = meter.push(value);
            if (out.byteLength) {
              controller.enqueue(out);
              return;
            }
          }
        } catch (err) {
          if (cancelled) return;
          logger.warn('upstream.stream_error', { request_id: requestId, ...errorFields(err) });
          finalize({
            status,
            usage: meter.usage,
            errorType: 'stream_error',
            receiptId,
            ttfbMs,
            stream: true,
          });
          controller.error(err);
        }
      },
      cancel() {
        cancelled = true;
        abort.abort();
        reader.cancel().catch(() => undefined);
        finalize({
          status: 499,
          usage: meter.usage,
          receiptId,
          ttfbMs,
          stream: true,
          aborted: true,
        });
      },
    });
    return new Response(relay, { status, headers: outHeaders });
  }

  // --- routes ------------------------------------------------------------------------------------
  app.post('/v1/messages', (c) => inference(c, 'messages'));
  app.post('/v1/chat/completions', (c) => inference(c, 'chat_completions'));

  // Token counting would send content upstream outside an inference route; Claude Code falls back
  // to a local estimate when this is absent.
  app.post('/v1/messages/count_tokens', () =>
    errorResponse(
      'anthropic',
      'not_found_error',
      'Token counting is not available.',
      newRequestId(),
    ),
  );

  app.get('/v1/models', async (c) => {
    const requestId = newRequestId();
    const anthropic = !!c.req.header('anthropic-version');
    const auth = await authenticate(c.req.raw.headers, now());
    if (!auth.ok)
      return errorResponse(anthropic ? 'anthropic' : 'openai', auth.type, auth.message, requestId);
    const models = Object.values(MODEL_ALIASES);
    if (anthropic) {
      return c.json({
        data: models.map((m) => ({
          type: 'model',
          id: m.id,
          display_name: m.displayName,
          description: m.description,
          created_at: '2026-09-01T00:00:00Z',
        })),
        has_more: false,
        first_id: models[0]?.id ?? null,
        last_id: models.at(-1)?.id ?? null,
      });
    }
    return c.json({
      object: 'list',
      data: models.map((m) => ({
        id: m.id,
        object: 'model',
        created: 1788220800,
        owned_by: 'sealcode',
      })),
    });
  });

  // Claude Code's connection-warming probe (HEAD is served by the GET route).
  app.get('/api/hello', () => new Response(null, { status: 200 }));
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/', (c) =>
    c.json({
      service: 'sealcode-gateway',
      docs: `${cfg.siteUrl}/docs`,
      trust: `${cfg.siteUrl}/trust`,
    }),
  );

  app.notFound(() => errorResponse('anthropic', 'not_found_error', 'Not found.', newRequestId()));
  app.onError((err) => {
    const requestId = newRequestId();
    logger.error('request.unhandled', { request_id: requestId, ...errorFields(err) });
    return errorResponse('anthropic', 'api_error', 'Internal error.', requestId);
  });

  return app;
}

/** The upstream error's `type` (or OpenAI `code`), never its message. */
function errorTypeOf(text: string): string | null {
  try {
    const body = JSON.parse(text) as { error?: { type?: unknown; code?: unknown } };
    const t = body.error?.type ?? body.error?.code;
    return typeof t === 'string' ? t.slice(0, 64) : null;
  } catch {
    return 'non_json_error';
  }
}
