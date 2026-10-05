import { NextResponse } from 'next/server';
import { PLAYGROUND } from '@sealcode/shared';
import { signPlaygroundToken } from '@sealcode/shared/node';
import { env } from '@/lib/env';
import { allow, clientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const OFFLINE =
  'The live playground is offline right now. Try again shortly, or contact us for a live demo.';

/** Last gateway health check. Successes are reused for 30 seconds and failures for 10. */
let health: { at: number; ok: boolean } | null = null;

async function gatewayUp(gateway: string): Promise<boolean> {
  if (health && Date.now() - health.at < (health.ok ? 30_000 : 10_000)) return health.ok;
  let ok: boolean;
  try {
    const res = await fetch(`${gateway}/healthz`, {
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  health = { at: Date.now(), ok };
  return ok;
}

/**
 * Issue a short-lived playground token. The browser presents it straight to the gateway, so this
 * app never sees what visitors type.
 */
export async function POST(request: Request) {
  const e = env();
  const origin = request.headers.get('origin');
  if (origin && origin !== e.PUBLIC_SITE_URL)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ip = await clientKey();
  const ok = ip
    ? allow(`pg-ip:${ip}`, PLAYGROUND.tokensIssuedPerIpPerHour, 3_600_000)
    : allow('pg-shared', 400, 3_600_000);
  if (!ok) {
    return NextResponse.json(
      { error: 'The playground is busy. Try again later, or contact us to set up a pilot.' },
      { status: 429, headers: { 'retry-after': '600' } },
    );
  }
  if (!(await gatewayUp(e.PUBLIC_GATEWAY_URL))) {
    return NextResponse.json(
      { error: OFFLINE },
      { status: 503, headers: { 'retry-after': '30', 'cache-control': 'no-store' } },
    );
  }
  const { token, payload } = signPlaygroundToken(
    e.PLAYGROUND_TOKEN_SECRET,
    PLAYGROUND.tokenTtlSeconds,
  );
  return NextResponse.json(
    {
      token,
      expires_at: new Date(payload.exp * 1000).toISOString(),
      gateway_url: e.PUBLIC_GATEWAY_URL,
      max_requests: PLAYGROUND.maxRequestsPerToken,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
