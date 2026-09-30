import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Field, inputClass, PageHeader, Table } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireOrg } from '@/lib/session';
import { renameOrg, updateProfile } from '../actions';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { repo, role, user } = await requireOrg();
  const [org, events] = await Promise.all([
    repo.org(),
    can(role, 'org.settings') ? repo.adminEvents(50) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Your profile</h2>
          <div className="mt-4">
            <ActionForm action={updateProfile} submitLabel="Save" inline>
              <div className="flex-1">
                <Field label="Name">
                  <input
                    name="name"
                    defaultValue={user.name ?? ''}
                    maxLength={120}
                    required
                    className={inputClass}
                  />
                </Field>
              </div>
            </ActionForm>
          </div>
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Two-factor sign-in</dt>
              <dd>{user.totpEnabledAt ? <Badge tone="verified">On</Badge> : <Badge>Off</Badge>}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            Lost your authenticator? Email support@sealcode.dev from this address to reset it.
          </p>
        </Card>
        {can(role, 'org.settings') && org ? (
          <Card className="p-6">
            <h2 className="font-semibold">Organisation</h2>
            <div className="mt-4">
              <ActionForm action={renameOrg} submitLabel="Rename" inline>
                <div className="flex-1">
                  <Field label="Name">
                    <input
                      name="name"
                      defaultValue={org.name}
                      maxLength={120}
                      required
                      className={inputClass}
                    />
                  </Field>
                </div>
              </ActionForm>
            </div>
            <p className="mt-4 font-mono text-xs text-muted">ID {org.id}</p>
          </Card>
        ) : null}
      </div>
      {events.length ? (
        <>
          <h2 className="mt-10 mb-3 font-semibold">Admin activity</h2>
          <Table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Who</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap font-mono text-xs text-ink-2">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td>{e.actorEmail ?? 'Sealcode staff'}</td>
                  <td className="font-mono text-xs">{e.action}</td>
                  <td className="font-mono text-xs text-muted">
                    {e.metadata
                      ? Object.entries(e.metadata)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(' ')
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ) : null}
    </>
  );
}
