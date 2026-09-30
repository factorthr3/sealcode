import type { Metadata } from 'next';
import { formatTokens, pooledAllowance, type PlanId } from '@sealcode/shared';
import { ActionForm } from '@/components/action-form';
import { Callout, Card, Field, inputClass, PageHeader, Table } from '@/components/ui';
import { currentPeriod } from '@/lib/format';
import { requireOrg } from '@/lib/session';
import { saveBudgets, saveSeatBudget } from '../actions';

export const metadata: Metadata = { title: 'Budgets' };

const tokenValue = (n: number | null | undefined) => (n ? formatTokens(n) : '');

export default async function BudgetsPage() {
  const { repo } = await requireOrg('budgets.manage');
  const [org, budgets, members, seatUsage] = await Promise.all([
    repo.org(),
    repo.budgets(),
    repo.members(),
    repo.seatUsage(currentPeriod()),
  ]);
  if (!org) return null;
  const allowance = pooledAllowance(org.plan as PlanId, org.seats);
  const orgBudget = budgets.find((b) => b.scope === 'org' && !b.userId)?.monthlyTokens;
  const seatDefault = budgets.find((b) => b.scope === 'seat' && !b.userId)?.monthlyTokens;
  const seatOverrides = new Map(
    budgets.filter((b) => b.scope === 'seat' && b.userId).map((b) => [b.userId!, b.monthlyTokens]),
  );
  const used = new Map(seatUsage.map((s) => [s.userId, s.tokens]));
  const trial = org.status === 'trial';

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly token caps for the whole organisation and for each seat. Alerts go to owners and admins at 50%, 80% and 100%."
      />
      {trial ? (
        <div className="mb-6">
          <Callout tone="warn" title="Trial">
            Trials stop at the {allowance ? formatTokens(allowance) : ''} token allowance whatever
            mode you choose. You can set lower caps here.
          </Callout>
        </div>
      ) : null}
      <Card className="p-6">
        <ActionForm action={saveBudgets} submitLabel="Save budgets" pendingLabel="Saving…">
          <fieldset className="space-y-3" disabled={trial}>
            <legend className="text-sm font-medium">When a budget runs out</legend>
            <label className="flex gap-3 rounded-lg border border-line p-3 has-checked:border-seal">
              <input
                type="radio"
                name="mode"
                value="soft"
                defaultChecked={org.budgetMode === 'soft'}
                className="mt-1 accent-[var(--seal)]"
              />
              <span>
                <span className="block text-sm font-medium">Soft alert</span>
                <span className="block text-xs text-muted">
                  Keep working and email admins. Usage past the pooled allowance is billed as
                  overage.
                </span>
              </span>
            </label>
            <label className="flex gap-3 rounded-lg border border-line p-3 has-checked:border-seal">
              <input
                type="radio"
                name="mode"
                value="hard"
                defaultChecked={org.budgetMode === 'hard'}
                className="mt-1 accent-[var(--seal)]"
              />
              <span>
                <span className="block text-sm font-medium">Hard stop</span>
                <span className="block text-xs text-muted">
                  Refuse requests with a clear message in Claude Code until next month or until an
                  admin raises the cap.
                </span>
              </span>
            </label>
          </fieldset>
          {trial ? <input type="hidden" name="mode" value="hard" /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Organisation monthly cap"
              hint={
                allowance
                  ? `Leave empty to use the pooled allowance (${formatTokens(allowance)}).`
                  : 'Leave empty for no cap.'
              }
            >
              <input
                name="orgBudget"
                defaultValue={tokenValue(orgBudget)}
                placeholder={allowance ? formatTokens(allowance) : 'No cap'}
                className={inputClass}
              />
            </Field>
            <Field
              label="Default cap per seat"
              hint="For example 5M. Leave empty for no per-seat cap."
            >
              <input
                name="seatDefault"
                defaultValue={tokenValue(seatDefault)}
                placeholder="No cap"
                className={inputClass}
              />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <h2 className="mt-10 mb-3 font-semibold">Per-seat overrides</h2>
      <Table>
        <thead>
          <tr>
            <th>Member</th>
            <th className="text-right">Used this month</th>
            <th>Cap</th>
          </tr>
        </thead>
        <tbody>
          {members
            .filter((m) => m.role !== 'billing')
            .map((m) => (
              <tr key={m.userId}>
                <td>{m.email}</td>
                <td className="text-right tabular-nums">{formatTokens(used.get(m.userId) ?? 0)}</td>
                <td>
                  <ActionForm
                    action={saveSeatBudget.bind(null, m.userId)}
                    submitLabel="Save"
                    submitVariant="ghost"
                    inline
                    className=""
                  >
                    <input
                      name="amount"
                      aria-label={`Monthly cap for ${m.email}`}
                      defaultValue={tokenValue(seatOverrides.get(m.userId))}
                      placeholder={
                        seatDefault ? `Default (${formatTokens(seatDefault)})` : 'No cap'
                      }
                      className={`${inputClass} w-44 py-1`}
                    />
                  </ActionForm>
                </td>
              </tr>
            ))}
        </tbody>
      </Table>
    </>
  );
}
