import { NextResponse } from 'next/server';
import { can } from '@/lib/permissions';
import { getSession } from '@/lib/session';
import { statementCsv } from '@/lib/statement';

export const dynamic = 'force-dynamic';

/** The month's statement as CSV: the same numbers Sealcode invoices from. */
export async function GET(request: Request) {
  const s = await getSession();
  if (!s || !s.mfaSatisfied) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const org = s.orgs.find((o) => o.id === s.session.activeOrgId) ?? s.orgs[0];
  if (!org || !can(org.role, 'billing.view'))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const month = new URL(request.url).searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  return statementCsv(org.id, month);
}
