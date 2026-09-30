import type { Metadata } from 'next';
import Link from 'next/link';
import { formatTokens, totalTokens } from '@sealcode/shared';
import { Badge, ButtonLink, Callout, Card, PageHeader, Stat } from '@/components/ui';
import { currentPeriod, formatInt, relativeTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireOrg } from '@/lib/session';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage({ searchParams }: PageProps<'/app'>) {
  const { denied } = await searchParams;
  const { repo, role, user } = await requireOrg();
  const period = currentPeriod();
  const orgWide = can(role, 'usage.view_all');
  const [totals, keys, members, recent, seatUsage] = await Promise.all([
    repo.monthTotals(period),
    repo.keys(orgWide ? {} : { userId: user.id }),
    repo.members(),
    can(role, 'audit.view') ? repo.audit({ limit: 6 }) : Promise.resolve([]),
    repo.seatUsage(period),
  ]);
  const activeKeys = keys.filter((k) => !k.revokedAt);
  const myTokens = seatUsage.find((s) => s.userId === user.id)?.tokens ?? 0;
  const myKeys = activeKeys.filter((k) => k.userId === user.id);
  const steps = [
    {
      done: myKeys.length > 0,
      label: 'Connect Claude Code',
      detail: 'Run npx sealcode login on your machine.',
      href: '/app/connect',
    },
    ...(can(role, 'members.manage')
      ? [
          {
            done: members.length > 1,
            label: 'Invite your team',
            detail: 'Each developer gets their own seat and keys.',
            href: '/app/members',
          },
        ]
      : []),
    ...(can(role, 'budgets.manage')
      ? [
          {
            done: false,
            label: 'Review budgets',
            detail: 'Choose a hard stop or a soft alert.',
            href: '/app/budgets',
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title="Overview" description={`Usage for ${period}, in UTC.`} />
      {denied ? (
        <div className="mb-6">
          <Callout tone="warn">That page needs an owner or admin role.</Callout>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={orgWide ? 'Tokens this month' : 'Your tokens this month'}
          value={formatTokens(orgWide ? totalTokens(totals) : myTokens)}
        />
        <Stat
          label="Requests"
          value={orgWide ? formatInt(totals.requests) : '—'}
          hint={orgWide ? undefined : 'Org-wide figures are for admins'}
        />
        <Stat label="Active keys" value={formatInt(activeKeys.length)} />
        <Stat label="Members" value={formatInt(members.length)} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="p-6 xl:col-span-2">
          <h2 className="font-semibold">Get set up</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex gap-3 rounded-lg p-2 hover:bg-surface-2">
                  <span
                    aria-hidden
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      s.done ? 'bg-verified text-white' : 'border border-line-strong text-muted'
                    }`}
                  >
                    {s.done ? '✓' : ''}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-muted">{s.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-6 xl:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent requests</h2>
            {can(role, 'audit.view') ? (
              <Link href="/app/audit" className="text-sm text-seal hover:underline">
                Audit log →
              </Link>
            ) : null}
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              {can(role, 'audit.view')
                ? 'No requests yet. They appear here within a second of completing.'
                : 'Request metadata is visible to admins.'}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((r) => (
                <li
                  key={r.requestId}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{r.email}</span>
                    <span className="block font-mono text-xs text-muted">
                      {r.modelAlias ?? '—'} ·{' '}
                      {formatTokens(r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens)} in ·{' '}
                      {formatTokens(r.outputTokens)} out
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.status < 400 ? (
                      <Badge tone="verified">{r.status}</Badge>
                    ) : (
                      <Badge tone="danger">{r.status}</Badge>
                    )}
                    <span className="text-xs text-muted">{relativeTime(r.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {myKeys.length === 0 ? (
        <div className="mt-8">
          <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold">Connect Claude Code in one command</h2>
              <p className="mt-1 text-sm text-muted">
                It takes about a minute, and your other Claude Code settings are kept.
              </p>
            </div>
            <ButtonLink href="/app/connect">Connect</ButtonLink>
          </Card>
        </div>
      ) : null}
    </>
  );
}
