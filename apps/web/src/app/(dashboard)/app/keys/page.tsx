import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-controls';
import { Badge, Card, Empty, Field, inputClass, PageHeader, Table } from '@/components/ui';
import { formatDate, relativeTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireOrg } from '@/lib/session';
import { createKey, revokeKey } from '../actions';

export const metadata: Metadata = { title: 'API keys' };

export default async function KeysPage() {
  const { repo, role, user } = await requireOrg();
  const manageAll = can(role, 'keys.manage_all');
  const [keys, members] = await Promise.all([
    repo.keys(manageAll ? {} : { userId: user.id }),
    manageAll ? repo.members() : [],
  ]);
  const seats = members.filter((m) => m.role !== 'billing');

  return (
    <>
      <PageHeader
        title="API keys"
        description="One key per developer per device. Keys are shown once, stored only as a salted hash, and stop working within five seconds of being revoked."
      />
      {role !== 'billing' ? (
        <Card className="mb-8 p-6">
          <h2 className="font-semibold">Create a key</h2>
          <p className="mt-1 text-sm text-muted">
            Most people should use <code className="font-mono text-xs">npx sealcode login</code>,
            which creates the key for you.
          </p>
          <div className="mt-4">
            <ActionForm action={createKey} submitLabel="Create key" pendingLabel="Creating…" inline>
              <div className="flex-1">
                <Field label="Device name">
                  <input
                    name="name"
                    required
                    maxLength={80}
                    placeholder="ci-runner or work-laptop"
                    className={inputClass}
                  />
                </Field>
              </div>
              {manageAll ? (
                <div className="sm:w-64">
                  <Field label="For">
                    <select name="userId" defaultValue={user.id} className={inputClass}>
                      {seats.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : null}
            </ActionForm>
          </div>
        </Card>
      ) : null}

      {keys.length === 0 ? (
        <Empty title="No keys yet">Create one above, or run npx sealcode login.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Key</th>
              {manageAll ? <th>Member</th> : null}
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th className="text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className={k.revokedAt ? 'opacity-60' : undefined}>
                <td>
                  <span className="block font-medium">{k.name}</span>
                  <span className="font-mono text-xs text-muted">
                    {k.prefix}…{k.last4}
                  </span>
                </td>
                {manageAll ? <td className="text-ink-2">{k.email}</td> : null}
                <td className="text-ink-2">{formatDate(k.createdAt)}</td>
                <td className="text-ink-2">{relativeTime(k.lastUsedAt)}</td>
                <td>
                  {k.revokedAt ? (
                    <Badge>Revoked {formatDate(k.revokedAt)}</Badge>
                  ) : (
                    <Badge tone="verified">Active</Badge>
                  )}
                </td>
                <td className="text-right">
                  {!k.revokedAt && (manageAll || k.userId === user.id) ? (
                    <form action={revokeKey.bind(null, k.id)}>
                      <SubmitButton variant="danger" size="sm" pendingLabel="Revoking…">
                        Revoke
                      </SubmitButton>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
