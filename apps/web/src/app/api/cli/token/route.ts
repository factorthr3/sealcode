import { NextResponse } from 'next/server';
import { acc } from '@/lib/db';
import { env } from '@/lib/env';
import { allow } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Step 2: the CLI polls until the user approves in the browser, then receives its key once. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { device_code?: unknown };
  if (typeof body.device_code !== 'string' || body.device_code.length > 200) {
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  }
  if (!allow(`poll:${body.device_code}`, 400, 900_000))
    return NextResponse.json({ status: 'slow_down' }, { status: 429 });
  const e = env();
  const result = await acc().pollDeviceCode(body.device_code, e.KEY_PEPPER);
  if (result.status !== 'approved') {
    return NextResponse.json(
      { status: result.status },
      { status: result.status === 'pending' ? 202 : 400 },
    );
  }
  return NextResponse.json(
    {
      status: 'approved',
      api_key: result.key,
      base_url: e.PUBLIC_GATEWAY_URL,
      org: result.orgName,
      email: result.email,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
