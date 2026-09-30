import { NextResponse } from 'next/server';
import { tenant } from '@/lib/db';
import { can } from '@/lib/permissions';
import { fetchReceipt, RECEIPT_ID } from '@/lib/receipts';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Verify a receipt from the org's own audit log. Other orgs' receipts are indistinguishable from unknown ones. */
export async function GET(_request: Request, ctx: RouteContext<'/api/receipts/[id]'>) {
  const { id } = await ctx.params;
  const s = await getSession();
  if (!s || !s.mfaSatisfied) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const org = s.orgs.find((o) => o.id === s.session.activeOrgId) ?? s.orgs[0];
  if (!org || !can(org.role, 'audit.view'))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!RECEIPT_ID.test(id) || !(await tenant(org.id).ownsReceipt(id))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const result = await fetchReceipt(id);
  if (!result) return NextResponse.json({ error: 'receipt_unavailable' }, { status: 502 });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
