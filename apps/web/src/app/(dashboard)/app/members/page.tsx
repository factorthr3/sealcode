import type { Metadata } from 'next';
import { seatLimit } from '@sealcode/db';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-controls';
import { Badge, Card, Field, inputClass, PageHeader, Table } from '@/components/ui';
import { formatDate, relativeTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/permissions';
import { requireOrg } from '@/lib/session';
import { changeRole, inviteMember, removeMember, revokeInvite } from '../actions';

export const metadata: Metadata = { title: 'Members' };

const ROLE_HELP = {
  owner: 'Everything, including ownership. Two-factor sign-in required.',
  admin: 'Members, keys, budgets and the audit log. Two-factor sign-in required.',
  developer: 'Their own keys and usage.',
  billing: 'Usage and billing only. Doesn’t take a seat.',
} as const;

export default async function MembersPage() {
  const { repo, role, user } = await requireOrg('members.manage');
  const [members, invites, org, seatsUsed] = await Promise.all([
    repo.members(),
    repo.invites(),
    repo.org(),
    repo.seatsInUse(),
  ]);
  const limit = org ? seatLimit(org) : 0;
  const roles = (
    role === 'owner'
      ? ['owner', 'admin', 'developer', 'billing']
      : ['admin', 'developer', 'billing']
  ) as (keyof typeof ROLE_HELP)[];

  return (
    <>
      <PageHeader
        title="Members"
        description={`${seatsUsed} of ${limit} seats in use, including pending invitations. Removing a member revokes their keys immediately.`}
      />
      <Card className="mb-8 p-6">
        <h2 className="font-semibold">Invite a teammate</h2>
        <div className="mt-4">
          <ActionForm
            action={inviteMember}
            submitLabel="Send invitation"
            pendingLabel="Sending…"
            inline
          >
            <div className="flex-1">
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="dev@company.com"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:w-48">
              <Field label="Role">
                <select name="role" defaultValue="developer" className={inputClass}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </ActionForm>
        </div>
        <dl className="mt-5 grid gap-2 text-xs text-muted sm:grid-cols-2">
          {Object.entries(ROLE_HELP).map(([r, help]) => (
            <div key={r}>
              <dt className="inline font-medium text-ink-2">
                {ROLE_LABELS[r as keyof typeof ROLE_HELP]}:{' '}
              </dt>
              <dd className="inline">{help}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Two-factor</th>
            <th>Last sign-in</th>
            <th className="text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td>
                <span className="block font-medium">{m.name ?? m.email}</span>
                {m.name ? <span className="text-xs text-muted">{m.email}</span> : null}
              </td>
              <td>
                {m.userId === user.id || (m.role === 'owner' && role !== 'owner') ? (
                  <Badge>{ROLE_LABELS[m.role]}</Badge>
                ) : (
                  <form
                    action={changeRole.bind(null, m.userId)}
                    className="flex items-center gap-2"
                  >
                    <select
                      name="role"
                      defaultValue={m.role}
                      aria-label={`Role for ${m.email}`}
                      className={`${inputClass} w-32 py-1`}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="ghost" size="sm">
                      Save
                    </SubmitButton>
                  </form>
                )}
              </td>
              <td>{m.twoFactor ? <Badge tone="verified">On</Badge> : <Badge>Off</Badge>}</td>
              <td className="text-ink-2">{relativeTime(m.lastLoginAt)}</td>
              <td className="text-right">
                {m.userId !== user.id && !(m.role === 'owner' && role !== 'owner') ? (
                  <form action={removeMember.bind(null, m.userId)}>
                    <SubmitButton variant="danger" size="sm" pendingLabel="Removing…">
                      Remove
                    </SubmitButton>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
          {invites.map((i) => (
            <tr key={i.id}>
              <td>
                <span className="block font-medium">{i.email}</span>
                <span className="text-xs text-muted">
                  Invited · expires {formatDate(i.expiresAt)}
                </span>
              </td>
              <td>
                <Badge tone="warn">{ROLE_LABELS[i.role]} (pending)</Badge>
              </td>
              <td>—</td>
              <td>—</td>
              <td className="text-right">
                <form action={revokeInvite.bind(null, i.id)}>
                  <SubmitButton variant="ghost" size="sm">
                    Withdraw
                  </SubmitButton>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
