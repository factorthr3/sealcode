import { NextResponse } from 'next/server';
import { PLAYGROUND } from '@sealcode/shared';
import { signPlaygroundToken } from '@sealcode/shared/node';
import { env } from '@/lib/env';
import { allow, clientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

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
      { error: 'The playground is busy. Start a free trial to keep going, or try again later.' },
      { status: 429, headers: { 'retry-after': '600' } },
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
