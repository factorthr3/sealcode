import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatTokens,
  formatUsd,
  isCustomPriced,
  monthlyStatement,
  PAID_PLAN_IDS,
  planName,
  PLANS,
  type PlanId,
} from '@sealcode/shared';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-controls';
import { Badge, Callout, Card, Field, inputClass, PageHeader, Stat, Table } from '@/components/ui';
import { acc, tenant } from '@/lib/db';
import { currentPeriod, daysLeft, formatDate, formatDateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/permissions';
import { activateOrg, extendTrial, setOrgStatus } from '../../actions';

export const metadata: Metadata = { title: 'Organisation' };

export default async function StaffOrgPage({
  params,
  searchParams,
}: PageProps<'/staff/orgs/[id]'>) {
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const repo = tenant(id);
  const org = await repo.org();
  if (!org) notFound();
  const period = currentPeriod();
  const [members, totals, subs, events, seats] = await Promise.all([
    repo.members(),
    repo.monthTotals(period),
    acc().subscriptionsFor(id),
    repo.adminEvents(30),
    repo.seatsInUse(),
  ]);
  const plan = org.plan as PlanId;
  const statement = monthlyStatement({
    plan,
    seats: org.seats,
    interval: org.billingInterval,
    usage: totals,
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link href="/staff" className="text-sm text-seal hover:underline">
        ← All organisations
      </Link>
      {created ? (
        <div className="mt-4">
          <Callout tone="verified" title="Organisation created">
            The owner has been emailed an invitation, valid for 14 days. It appears under Members
            once accepted.
          </Callout>
        </div>
      ) : null}
      <div className="mt-3">
        <PageHeader
          title={org.name}
          description={`${org.slug} · created ${formatDate(org.createdAt)} · ${org.id}`}
          actions={
            org.status === 'suspended' ? (
              <form action={setOrgStatus.bind(null, id, 'active')}>
                <SubmitButton variant="secondary">Reinstate</SubmitButton>
              </form>
            ) : (
              <form action={setOrgStatus.bind(null, id, 'suspended')}>
                <SubmitButton variant="danger">Suspend</SubmitButton>
              </form>
            )
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Status"
          value={
            <Badge
              tone={
                org.status === 'active' ? 'verified' : org.status === 'trial' ? 'warn' : 'danger'
              }
            >
              {org.status}
            </Badge>
          }
          hint={
            org.status === 'trial'
              ? `Pilot ends ${formatDate(org.trialEndsAt)} (${daysLeft(org.trialEndsAt)} days)`
              : `Activated ${formatDate(org.activatedAt)}`
          }
        />
        <Stat
          label="Plan"
          value={planName(plan)}
          hint={org.status === 'trial' ? undefined : `${org.seats} seats · ${org.billingInterval}`}
        />
        <Stat label="Seats in use" value={seats} hint={`${members.length} members`} />
        <Stat
          label={`Statement ${period}`}
          value={
            isCustomPriced(plan) ? 'Per agreement' : formatUsd(statement.totalUsd, { cents: true })
          }
          hint={
            isCustomPriced(plan)
              ? `${formatTokens(statement.usedTokens)} tokens this month`
              : `${formatTokens(statement.usedTokens)} tokens · overage ${formatUsd(statement.overageUsd, { cents: true })}`
          }
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">
            {org.status === 'trial' ? 'Activate plan' : 'Update agreement'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Records the agreement, lifts pilot limits and emails the org&rsquo;s owners and admins.
          </p>
          <div className="mt-5">
            <ActionForm
              action={activateOrg.bind(null, id)}
              submitLabel={org.status === 'trial' ? 'Activate' : 'Save agreement'}
              pendingLabel="Saving…"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Plan">
                  <select
                    name="plan"
                    defaultValue={plan === 'trial' ? 'team' : plan}
                    className={inputClass}
                  >
                    {PAID_PLAN_IDS.map((p) => (
                      <option key={p} value={p}>
                        {PLANS[p].name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Seats">
                  <input
                    name="seats"
                    type="number"
                    min={1}
                    defaultValue={Math.max(seats, org.status === 'trial' ? 3 : org.seats)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Billing">
                  <select name="interval" defaultValue={org.billingInterval} className={inputClass}>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </Field>
                <Field label="Starts">
                  <input
                    name="startsOn"
                    type="date"
                    defaultValue={today}
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Ends (optional)">
                  <input name="endsOn" type="date" className={inputClass} />
                </Field>
              </div>
              <Field label="Notes" hint="PO number, invoice reference, terms agreed.">
                <textarea name="notes" rows={2} className={inputClass} />
              </Field>
            </ActionForm>
          </div>
        </Card>

        <div className="space-y-6">
          {org.status === 'trial' ? (
            <Card className="p-6">
              <h2 className="font-semibold">Extend pilot</h2>
              <form action={extendTrial.bind(null, id)} className="mt-4 flex items-end gap-3">
                <Field label="Days">
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={90}
                    defaultValue={14}
                    className={`${inputClass} w-28`}
                  />
                </Field>
                <SubmitButton variant="secondary">Extend</SubmitButton>
              </form>
            </Card>
          ) : null}
          <Card className="p-6">
            <h2 className="font-semibold">Statement CSV</h2>
            <p className="mt-1 text-sm text-muted">
              The numbers to invoice from, computed from the audit log.
            </p>
            <div className="mt-3 flex gap-3 text-sm">
              <a
                className="text-seal hover:underline"
                href={`/api/staff/statement?org=${id}&month=${period}`}
              >
                {period}
              </a>
              <a
                className="text-seal hover:underline"
                href={`/api/staff/statement?org=${id}&month=${new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7)}`}
              >
                Previous month
              </a>
            </div>
          </Card>
        </div>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Members</h2>
      <Table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Two-factor</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td>{m.email}</td>
              <td>{ROLE_LABELS[m.role]}</td>
              <td>{m.twoFactor ? 'On' : 'Off'}</td>
              <td className="text-muted">{formatDate(m.joinedAt)}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      {subs.length ? (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold">Agreements</h2>
          <Table>
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Plan</th>
                <th>Term</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs text-muted">{formatDateTime(s.createdAt)}</td>
                  <td>
                    {planName(s.plan)} · {s.seats} seats · {s.interval}
                  </td>
                  <td>
                    {formatDate(s.startsOn)} – {s.endsOn ? formatDate(s.endsOn) : 'rolling'}
                  </td>
                  <td className="text-xs text-ink-2">{s.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ) : null}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Recent admin events</h2>
      <Table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Who</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td className="font-mono text-xs text-muted">{formatDateTime(e.createdAt)}</td>
              <td>{e.actorEmail ?? '—'}</td>
              <td className="font-mono text-xs">{e.action}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
