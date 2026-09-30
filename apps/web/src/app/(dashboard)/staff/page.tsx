import type { Metadata } from 'next';
import Link from 'next/link';
import { formatTokens, planName, PLAYGROUND } from '@sealcode/shared';
import { SubmitButton } from '@/components/form-controls';
import { Badge, Empty, inputClass, PageHeader, Stat, Table } from '@/components/ui';
import { acc } from '@/lib/db';
import { currentPeriod, daysLeft, formatDate, formatDateTime } from '@/lib/format';
import { setEnquiryStatus } from './actions';

export const metadata: Metadata = { title: 'Staff console' };

const STATUS_TONE = { trial: 'warn', active: 'verified', suspended: 'danger' } as const;

export default async function StaffHome() {
  const [orgs, enquiries, playground] = await Promise.all([
    acc().staffOrgs(currentPeriod()),
    acc().staffEnquiries(100),
    acc().playgroundUsage(7),
  ]);
  const trials = orgs.filter((o) => o.status === 'trial');
  const endingSoon = trials.filter((o) => daysLeft(o.trialEndsAt) <= 3);
  const open = enquiries.filter((e) => e.status === 'new');
  const today = playground[0];

  return (
    <>
      <PageHeader
        title="Staff console"
        description="Enquiries, trials and activations. Activation records the agreement and lifts trial limits immediately."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="New enquiries" value={open.length} />
        <Stat label="Active orgs" value={orgs.filter((o) => o.status === 'active').length} />
        <Stat
          label="Trials"
          value={trials.length}
          hint={`${endingSoon.length} ending within 3 days`}
        />
        <Stat
          label="Playground today"
          value={formatTokens(
            today?.day === new Date().toISOString().slice(0, 10) ? today.tokens : 0,
          )}
          hint={`of ${formatTokens(PLAYGROUND.dailyTokenCap)} daily cap`}
        />
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Enquiries</h2>
      {enquiries.length === 0 ? (
        <Empty title="No enquiries yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Received</th>
              <th>From</th>
              <th>Interest</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap font-mono text-xs text-muted">
                  {formatDateTime(e.createdAt)}
                </td>
                <td>
                  <span className="block font-medium">{e.company}</span>
                  <a href={`mailto:${e.email}`} className="text-xs text-seal hover:underline">
                    {e.name} &lt;{e.email}&gt;
                  </a>
                  {e.orgId ? (
                    <Link
                      href={`/staff/orgs/${e.orgId}`}
                      className="block text-xs text-ink-2 underline"
                    >
                      Open org
                    </Link>
                  ) : null}
                </td>
                <td className="text-xs">
                  <span className="block">{e.planInterest.replace(':', ' · ')}</span>
                  <span className="text-muted">
                    {e.teamSize} engineers{e.seats ? ` · ${e.seats} seats` : ''} · {e.source}
                  </span>
                </td>
                <td className="max-w-sm text-xs whitespace-pre-wrap text-ink-2">
                  {e.message ?? '—'}
                </td>
                <td>
                  <form
                    action={setEnquiryStatus.bind(null, e.id)}
                    className="flex items-center gap-1"
                  >
                    <select
                      name="status"
                      defaultValue={e.status}
                      aria-label="Enquiry status"
                      className={`${inputClass} w-28 py-1 text-xs`}
                    >
                      {['new', 'contacted', 'won', 'lost'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <SubmitButton variant="ghost" size="sm">
                      Save
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Organisations</h2>
      <Table>
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Status</th>
            <th>Plan</th>
            <th className="text-right">Members</th>
            <th className="text-right">Tokens this month</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td>
                <Link
                  href={`/staff/orgs/${o.id}`}
                  className="font-medium text-seal hover:underline"
                >
                  {o.name}
                </Link>
                <span className="block font-mono text-xs text-muted">{o.slug}</span>
              </td>
              <td>
                <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                {o.status === 'trial' ? (
                  <span className="ml-2 text-xs text-muted">{daysLeft(o.trialEndsAt)} d left</span>
                ) : null}
              </td>
              <td>
                {planName(o.plan)}
                {o.status === 'active' ? (
                  <span className="text-xs text-muted">
                    {' '}
                    · {o.seats} seats · {o.billingInterval}
                  </span>
                ) : null}
              </td>
              <td className="text-right tabular-nums">{o.members}</td>
              <td className="text-right tabular-nums">{formatTokens(Number(o.monthTokens))}</td>
              <td className="text-muted">{formatDate(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
