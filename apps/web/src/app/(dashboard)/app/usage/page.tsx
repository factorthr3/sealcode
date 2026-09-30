import type { Metadata } from 'next';
import Link from 'next/link';
import { formatTokens, MODEL_ALIASES, totalTokens } from '@sealcode/shared';
import { Card, PageHeader, Stat, Table } from '@/components/ui';
import { UsageChart, type DailyPoint } from '@/components/usage-chart';
import { currentPeriod, formatInt } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireOrg } from '@/lib/session';

export const metadata: Metadata = { title: 'Usage' };

function monthRange(period: string) {
  const start = new Date(`${period}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    days: end.getUTCDate(),
  };
}

function recentPeriods(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7),
  );
}

export default async function UsagePage({ searchParams }: PageProps<'/app/usage'>) {
  const { month } = await searchParams;
  const { repo, role, user } = await requireOrg();
  const periods = recentPeriods(6);
  const period = typeof month === 'string' && periods.includes(month) ? month : currentPeriod();
  const orgWide = can(role, 'usage.view_all');
  const range = monthRange(period);
  const [rows, members, keys] = await Promise.all([
    repo.usageDaily(range),
    orgWide ? repo.members() : [],
    repo.keys(orgWide ? {} : { userId: user.id }),
  ]);
  const visible = orgWide ? rows : rows.filter((r) => r.userId === user.id);

  const aliases = Object.keys(MODEL_ALIASES);
  const series = aliases.map((a) => ({ key: a, label: a }));
  const byDay = new Map<string, Record<string, number>>();
  const byUser = new Map<string, { tokens: number; requests: number }>();
  const byModel = new Map<
    string,
    { input: number; cached: number; output: number; requests: number }
  >();
  const byKey = new Map<string, number>();
  let requests = 0;
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const r of visible) {
    const t = r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    const day = byDay.get(r.day) ?? {};
    day[r.modelAlias] = (day[r.modelAlias] ?? 0) + t;
    byDay.set(r.day, day);
    const u = byUser.get(r.userId) ?? { tokens: 0, requests: 0 };
    byUser.set(r.userId, { tokens: u.tokens + t, requests: u.requests + r.requests });
    const m = byModel.get(r.modelAlias) ?? { input: 0, cached: 0, output: 0, requests: 0 };
    byModel.set(r.modelAlias, {
      input: m.input + r.inputTokens + r.cacheWriteTokens,
      cached: m.cached + r.cacheReadTokens,
      output: m.output + r.outputTokens,
      requests: m.requests + r.requests,
    });
    byKey.set(r.keyId, (byKey.get(r.keyId) ?? 0) + t);
    requests += r.requests;
    totals.inputTokens += r.inputTokens;
    totals.outputTokens += r.outputTokens;
    totals.cacheReadTokens += r.cacheReadTokens;
    totals.cacheWriteTokens += r.cacheWriteTokens;
  }
  const data: DailyPoint[] = Array.from({ length: range.days }, (_, i) => {
    const day = `${period}-${String(i + 1).padStart(2, '0')}`;
    return { day, values: byDay.get(day) ?? {} };
  });
  const total = totalTokens(totals);
  const inputAll = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const keyById = new Map(keys.map((k) => [k.id, k]));

  return (
    <>
      <PageHeader
        title="Usage"
        description={
          orgWide
            ? 'Token usage across your organisation, from the metadata-only audit log.'
            : 'Your own token usage.'
        }
        actions={
          <nav aria-label="Month" className="flex flex-wrap gap-1">
            {periods.map((p) => (
              <Link
                key={p}
                href={`/app/usage?month=${p}`}
                aria-current={p === period ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-xs ${p === period ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-surface-2'}`}
              >
                {new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-GB', {
                  month: 'short',
                  year: '2-digit',
                  timeZone: 'UTC',
                })}
              </Link>
            ))}
          </nav>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total tokens"
          value={formatTokens(total)}
          hint={`${formatInt(requests)} requests`}
        />
        <Stat label="Input" value={formatTokens(inputAll)} />
        <Stat
          label="Served from cache"
          value={inputAll ? `${Math.round((totals.cacheReadTokens / inputAll) * 100)}%` : '—'}
          hint="Share of input tokens read from the prompt cache"
        />
        <Stat label="Output" value={formatTokens(totals.outputTokens)} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-4 font-semibold">Tokens per day by model</h2>
        {total === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No usage in this month yet.</p>
        ) : (
          <UsageChart data={data} series={series} title={`Tokens per day by model, ${period}`} />
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {orgWide ? (
          <section>
            <h2 className="mb-3 font-semibold">By seat</h2>
            <Table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="text-right">Requests</th>
                  <th className="text-right">Tokens</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {[...byUser.entries()]
                  .sort((a, b) => b[1].tokens - a[1].tokens)
                  .map(([userId, u]) => (
                    <tr key={userId}>
                      <td>{memberById.get(userId)?.email ?? 'Former member'}</td>
                      <td className="text-right tabular-nums">{formatInt(u.requests)}</td>
                      <td className="text-right tabular-nums">{formatTokens(u.tokens)}</td>
                      <td className="text-right tabular-nums text-muted">
                        {total ? `${Math.round((u.tokens / total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </section>
        ) : null}
        <section>
          <h2 className="mb-3 font-semibold">By model</h2>
          <Table>
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">Input</th>
                <th className="text-right">Cached</th>
                <th className="text-right">Output</th>
              </tr>
            </thead>
            <tbody>
              {[...byModel.entries()].map(([alias, m]) => (
                <tr key={alias}>
                  <td>
                    <span className="font-mono text-xs">{alias}</span>
                  </td>
                  <td className="text-right tabular-nums">{formatTokens(m.input)}</td>
                  <td className="text-right tabular-nums">{formatTokens(m.cached)}</td>
                  <td className="text-right tabular-nums">{formatTokens(m.output)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
        <section>
          <h2 className="mb-3 font-semibold">By key</h2>
          <Table>
            <thead>
              <tr>
                <th>Key</th>
                <th className="text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {[...byKey.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([keyId, t]) => (
                  <tr key={keyId}>
                    <td>
                      {keyById.get(keyId)?.name ?? 'Deleted key'}{' '}
                      <span className="font-mono text-xs text-muted">
                        …{keyById.get(keyId)?.last4}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{formatTokens(t)}</td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </section>
      </div>
    </>
  );
}
