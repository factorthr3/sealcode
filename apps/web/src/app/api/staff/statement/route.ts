import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { statementCsv } from '@/lib/statement';

export const dynamic = 'force-dynamic';

/** Any org's monthly statement, for staff invoicing under contact-us billing. */
export async function GET(request: Request) {
  const s = await getSession();
  if (!s || !s.mfaSatisfied || !s.user.isStaff)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const org = params.get('org') ?? '';
  const month = params.get('month') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(org) || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'org and month (YYYY-MM) are required' }, { status: 400 });
  }
  return statementCsv(org, month);
}
