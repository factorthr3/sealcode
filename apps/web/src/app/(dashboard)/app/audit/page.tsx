import type { Metadata } from 'next';
import Link from 'next/link';
import { formatTokens } from '@sealcode/shared';
import { Badge, buttonClass, Callout, Empty, inputClass, PageHeader, Table } from '@/components/ui';
import { formatDateTime, formatInt } from '@/lib/format';
import { requireOrg } from '@/lib/session';
import { ReceiptButton } from './receipt-button';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE = 50;

export default async function AuditPage({ searchParams }: PageProps<'/app/audit'>) {
  const params = await searchParams;
  const { repo } = await requireOrg('audit.view');
  const member = typeof params.member === 'string' && params.member ? params.member : undefined;
  const before = typeof params.before === 'string' ? new Date(params.before) : undefined;
  const [rows, members] = await Promise.all([
    repo.audit({
      limit: PAGE,
      userId: member,
      before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    }),
    repo.members(),
  ]);
  const exportHref = `/api/audit/export${member ? `?member=${member}` : ''}`;
  const last = rows.at(-1);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every request through the gateway: who, which key, which model, how many tokens and the Phala receipt. Metadata only: prompts and completions are never stored."
        actions={
          <a href={exportHref} className={buttonClass('secondary', 'md')}>
            Export CSV
          </a>
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/app/audit">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Member</span>
          <select name="member" defaultValue={member ?? ''} className={`${inputClass} w-64`}>
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.email}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass('secondary', 'md')}>Filter</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="No requests yet">Requests appear here as soon as they complete.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Model</th>
              <th className="text-right">Tokens in / cached / out</th>
              <th>Result</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.requestId} className="align-top">
                <td>
                  <span className="block font-mono text-xs text-muted">
                    {formatDateTime(r.createdAt)}
                  </span>
                  <span className="block">{r.email ?? 'Former member'}</span>
                  <span className="font-mono text-xs text-muted">
                    {r.keyName ?? 'key'} …{r.keyLast4}
                  </span>
                </td>
                <td className="font-mono text-xs">{r.modelAlias ?? '—'}</td>
                <td className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                  {formatTokens(r.inputTokens + r.cacheWriteTokens)} /{' '}
                  {formatTokens(r.cacheReadTokens)} / {formatTokens(r.outputTokens)}
                </td>
                <td>
                  {r.status < 400 ? (
                    <Badge tone="verified">{r.status}</Badge>
                  ) : (
                    <Badge tone={r.status === 499 ? 'neutral' : 'danger'}>
                      {r.status} {r.errorType ?? ''}
                    </Badge>
                  )}
                  <span className="mt-1 block font-mono text-xs text-muted tabular-nums">
                    {formatInt(r.latencyMs)} ms
                  </span>
                </td>
                <td className="min-w-40">
                  {r.receiptId ? (
                    <>
                      <span className="block font-mono text-[11px] text-muted">
                        {r.receiptId.slice(0, 14)}…
                      </span>
                      <ReceiptButton receiptId={r.receiptId} />
                    </>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {rows.length === PAGE && last ? (
        <div className="mt-4 flex justify-end">
          <Link
            href={`/app/audit?before=${encodeURIComponent(last.createdAt.toISOString())}${member ? `&member=${member}` : ''}`}
            className={buttonClass('secondary', 'sm')}
          >
            Older →
          </Link>
        </div>
      ) : null}
      <div className="mt-6">
        <Callout>
          Receipts are signed by Phala&rsquo;s attested gateway. <strong>Verify</strong> fetches the
          receipt and checks that the request reached a model inside a TEE (
          <code className="font-mono text-xs">upstream.verified</code>, required). See{' '}
          <Link href="/trust">the trust center</Link> for how to verify the whole chain yourself.
        </Callout>
      </div>
    </>
  );
}
