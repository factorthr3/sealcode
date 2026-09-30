import { NextResponse } from 'next/server';
import { fetchReceipt, RECEIPT_ID } from '@/lib/receipts';
import { allow, clientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Receipt lookup for playground visitors. Receipt IDs are unguessable and receipts carry only
 * hashes and routing metadata, never content; lookups are rate-limited.
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/playground/receipts/[id]'>) {
  const { id } = await ctx.params;
  if (!RECEIPT_ID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const ip = (await clientKey()) ?? 'shared';
  if (!allow(`pg-receipt:${ip}`, ip === 'shared' ? 2_000 : 60, 3_600_000)) {
    return NextResponse.json({ error: 'slow_down' }, { status: 429 });
  }
  const result = await fetchReceipt(id);
  if (!result) return NextResponse.json({ error: 'receipt_unavailable' }, { status: 502 });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
