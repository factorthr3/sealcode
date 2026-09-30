import { NextResponse } from 'next/server';
import { csvRow } from '@/lib/csv';
import { getSession } from '@/lib/session';
import { tenant } from '@/lib/db';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'request_id',
  'time_utc',
  'member',
  'key_name',
  'key_last4',
  'endpoint',
  'model_alias',
  'upstream_model',
  'input_tokens',
  'cache_write_tokens',
  'cache_read_tokens',
  'output_tokens',
  'latency_ms',
  'ttfb_ms',
  'status',
  'error_type',
  'receipt_id',
  'stream',
];

/** CSV export of the audit log (metadata only), up to 10,000 most recent rows per request. */
export async function GET(request: Request) {
  const s = await getSession();
  if (!s || !s.mfaSatisfied) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const org = s.orgs.find((o) => o.id === s.session.activeOrgId) ?? s.orgs[0];
  if (!org || !can(org.role, 'audit.view'))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const member = new URL(request.url).searchParams.get('member') || undefined;
  const rows = await tenant(org.id).audit({
    limit: 10_000,
    userId: member && /^[0-9a-f-]{36}$/.test(member) ? member : undefined,
  });
  let csv = csvRow(COLUMNS);
  for (const r of rows) {
    csv += csvRow([
      r.requestId,
      r.createdAt,
      r.email,
      r.keyName,
      r.keyLast4,
      r.endpoint,
      r.modelAlias,
      r.upstreamModel,
      r.inputTokens,
      r.cacheWriteTokens,
      r.cacheReadTokens,
      r.outputTokens,
      r.latencyMs,
      r.ttfbMs,
      r.status,
      r.errorType,
      r.receiptId,
      r.stream,
    ]);
  }
  await tenant(org.id).logAdmin(s.user.id, 'audit.exported', null, { rows: rows.length });
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sealcode-audit-${org.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
