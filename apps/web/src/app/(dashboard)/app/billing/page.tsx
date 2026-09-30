import type { Metadata } from 'next';
import { seatLimit } from '@sealcode/db';
import {
  formatTokens,
  formatUsd,
  monthlyStatement,
  PAID_PLAN_IDS,
  planName,
  PLANS,
  SALES_EMAIL,
  TRIAL,
  type PlanId,
} from '@sealcode/shared';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Field, inputClass, PageHeader, Stat, Table } from '@/components/ui';
import { acc } from '@/lib/db';
import { currentPeriod, daysLeft, formatDate } from '@/lib/format';
import { requireOrg } from '@/lib/session';
import { requestActivation } from '../actions';

export const metadata: Metadata = { title: 'Billing' };

function previousPeriod(period: string) {
  const d = new Date(`${period}-01T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

export default async function BillingPage() {
  const { repo } = await requireOrg('billing.view');
  const org = (await repo.org())!;
  const period = currentPeriod();
  const [members, seatsUsed, thisMonth, lastMonth, subs] = await Promise.all([
    repo.members(),
    repo.seatsInUse(),
    repo.monthTotals(period),
    repo.monthTotals(previousPeriod(period)),
    acc().subscriptionsFor(org.id),
  ]);
  const plan = org.plan as PlanId;
  const suggestedSeats = Math.max(
    PLANS.team.minSeats,
    members.filter((m) => m.role !== 'billing').length,
  );

  const activation = (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">
        {org.status === 'trial' ? 'Activate your plan' : 'Change plan or seats'}
      </h2>
      <p className="mt-1 text-sm text-muted">
        We don&rsquo;t take cards online yet. Tell us what you need and we&rsquo;ll send an order
        form and invoice, usually within one working day. Your{' '}
        {org.status === 'trial' ? 'trial' : 'service'} keeps running meanwhile. Or email{' '}
        <a href={`mailto:${SALES_EMAIL}`} className="text-seal hover:underline">
          {SALES_EMAIL}
        </a>
        .
      </p>
      <div className="mt-5">
        <ActionForm
          action={requestActivation}
          submitLabel="Request activation"
          pendingLabel="Sending…"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan">
              <select
                name="plan"
                defaultValue={plan === 'trial' ? 'team' : plan}
                className={inputClass}
              >
                {PAID_PLAN_IDS.map((id) => (
                  <option key={id} value={id}>
                    {PLANS[id].name}
                    {PLANS[id].pricePerSeatMonthly
                      ? ` (${formatUsd(PLANS[id].pricePerSeatMonthly!)}/seat/month)`
                      : ' (custom)'}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Seats"
              hint={`Team starts at ${PLANS.team.minSeats}, Business at ${PLANS.business.minSeats}.`}
            >
              <input
                name="seats"
                type="number"
                min={1}
                max={10000}
                defaultValue={suggestedSeats}
                className={inputClass}
              />
            </Field>
          </div>
          <Field
            label="Anything we should know? (optional)"
            hint="Procurement steps, security review, PO numbers, preferred start date."
          >
            <textarea name="message" rows={3} maxLength={2000} className={inputClass} />
          </Field>
        </ActionForm>
      </div>
    </Card>
  );

  if (org.status === 'trial') {
    const used =
      thisMonth.inputTokens +
      thisMonth.outputTokens +
      thisMonth.cacheReadTokens +
      thisMonth.cacheWriteTokens;
    return (
      <>
        <PageHeader title="Billing" description="You’re on the free trial. No card needed." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Trial ends"
            value={formatDate(org.trialEndsAt)}
            hint={`${daysLeft(org.trialEndsAt)} days left`}
          />
          <Stat
            label="Tokens used"
            value={`${formatTokens(used)} / ${formatTokens(TRIAL.pooledTokens)}`}
          />
          <Stat label="Seats" value={`${seatsUsed} / ${seatLimit(org)}`} />
        </div>
        <div className="mt-6">{activation}</div>
      </>
    );
  }

  const statements = [
    { period, usage: thisMonth, label: 'This month (so far)' },
    { period: previousPeriod(period), usage: lastMonth, label: 'Last month' },
  ].map((s) => ({
    ...s,
    statement: monthlyStatement({
      plan,
      seats: org.seats,
      interval: org.billingInterval,
      usage: s.usage,
    }),
  }));

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan and monthly statements. Statements are computed from the audit log with the published overage rates."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Plan"
          value={planName(plan)}
          hint={`${org.billingInterval === 'annual' ? 'Annual' : 'Monthly'} billing`}
        />
        <Stat label="Seats" value={`${seatsUsed} / ${org.seats}`} />
        <Stat label="Active since" value={formatDate(org.activatedAt)} />
      </div>
      <h2 className="mt-10 mb-3 font-semibold">Statements</h2>
      <Table>
        <thead>
          <tr>
            <th>Period</th>
            <th className="text-right">Seat fees</th>
            <th className="text-right">Tokens used / allowance</th>
            <th className="text-right">Overage</th>
            <th className="text-right">Total (ex. VAT)</th>
            <th>
              <span className="sr-only">Download</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {statements.map(({ period: p, label, statement }) => (
            <tr key={p}>
              <td>
                <span className="block font-medium">{p}</span>
                <span className="text-xs text-muted">{label}</span>
              </td>
              <td className="text-right tabular-nums">
                {formatUsd(statement.seatFeesUsd + statement.platformFeeUsd, { cents: true })}
              </td>
              <td className="text-right tabular-nums">
                {formatTokens(statement.usedTokens)} /{' '}
                {statement.allowanceTokens ? formatTokens(statement.allowanceTokens) : 'custom'}
              </td>
              <td className="text-right tabular-nums">
                {formatUsd(statement.overageUsd, { cents: true })}
              </td>
              <td className="text-right font-medium tabular-nums">
                {formatUsd(statement.totalUsd, { cents: true })}
              </td>
              <td className="text-right">
                <a
                  href={`/api/billing/statement?month=${p}`}
                  className="text-xs text-seal hover:underline"
                >
                  CSV
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {subs.length ? (
        <>
          <h2 className="mt-10 mb-3 font-semibold">Agreements</h2>
          <Table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Seats</th>
                <th>Billing</th>
                <th>Term</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td>
                    {planName(s.plan)} <Badge>{s.source}</Badge>
                  </td>
                  <td>{s.seats}</td>
                  <td>{s.interval}</td>
                  <td>
                    {formatDate(s.startsOn)} – {s.endsOn ? formatDate(s.endsOn) : 'rolling'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ) : null}
      <div className="mt-10">{activation}</div>
    </>
  );
}
