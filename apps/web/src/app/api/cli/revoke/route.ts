import { NextResponse } from 'next/server';
import { hashApiKey, isApiKeyFormat } from '@sealcode/shared/node';
import { acc } from '@/lib/db';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** `sealcode logout`: the key presented in Authorization revokes itself. */
export async function POST(request: Request) {
  const key = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key || !isApiKeyFormat(key)) return NextResponse.json({ revoked: false }, { status: 401 });
  const revoked = await acc().revokeKeyByHash(hashApiKey(key, env().KEY_PEPPER));
  return NextResponse.json({ revoked });
}
