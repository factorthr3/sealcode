import { NextResponse } from 'next/server';
import { acc } from '@/lib/db';
import { env } from '@/lib/env';
import { allow, clientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Step 1 of `npx sealcode login` (RFC 8628-style device authorisation). */
export async function POST(request: Request) {
  const ip = (await clientKey()) ?? 'shared';
  if (!allow(`device:${ip}`, ip === 'shared' ? 600 : 30, 3_600_000)) {
    return NextResponse.json({ error: 'slow_down' }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { client_name?: unknown };
  const clientName = typeof body.client_name === 'string' ? body.client_name : 'device';
  const { deviceCode, userCode, expiresAt } = await acc().createDeviceCode(clientName);
  const site = env().PUBLIC_SITE_URL;
  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${site}/device`,
    verification_uri_complete: `${site}/device?code=${userCode}`,
    expires_in: Math.round((expiresAt.getTime() - Date.now()) / 1000),
    interval: 2,
  });
}
