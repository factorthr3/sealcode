import { NextResponse } from 'next/server';
import { getAttestation } from '@/lib/attestation';
import { allow, clientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public attestation for the CVM running the gateway, web app and database.
 * `?nonce=<hex>` returns a fresh TDX quote whose report data is sha256(prefix + nonce).
 */
export async function GET(request: Request) {
  const nonce = new URL(request.url).searchParams.get('nonce') ?? undefined;
  if (nonce !== undefined && !/^[0-9a-fA-F]{16,128}$/.test(nonce)) {
    return NextResponse.json({ error: 'nonce must be 16 to 128 hex characters' }, { status: 400 });
  }
  if (nonce) {
    const ip = (await clientKey()) ?? 'shared';
    if (!allow(`attest:${ip}`, ip === 'shared' ? 600 : 30, 3_600_000)) {
      return NextResponse.json({ error: 'slow_down' }, { status: 429 });
    }
  }
  const attestation = await getAttestation(nonce);
  return NextResponse.json(attestation, {
    headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
  });
}
