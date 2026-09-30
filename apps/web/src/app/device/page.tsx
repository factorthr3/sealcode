import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form-controls';
import { Logo } from '@/components/logo';
import { Callout, Card, Field, inputClass } from '@/components/ui';
import { acc } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { approveDevice, denyDevice } from './actions';

export const metadata: Metadata = { title: 'Approve Sealcode CLI', robots: { index: false } };

export default async function DevicePage({ searchParams }: PageProps<'/device'>) {
  const params = await searchParams;
  const code = typeof params.code === 'string' ? params.code.toUpperCase().slice(0, 9) : '';
  const s = await requireUser(code ? `/device?code=${code}` : '/device');
  const pending = code ? await acc().pendingDeviceCode(code) : null;
  const orgs = s.orgs.filter((o) => o.role !== 'billing');

  let body: React.ReactNode;
  if (params.done === 'approved') {
    body = (
      <>
        <h1 className="font-display text-4xl tracking-tight">Device approved</h1>
        <p className="mt-2 text-sm text-muted">
          Return to your terminal. The CLI is configuring Claude Code now.
        </p>
      </>
    );
  } else if (params.done === 'denied') {
    body = (
      <>
        <h1 className="font-display text-4xl tracking-tight">Request denied</h1>
        <p className="mt-2 text-sm text-muted">No key was created. You can close this tab.</p>
      </>
    );
  } else if (!pending) {
    body = (
      <>
        <h1 className="font-display text-4xl tracking-tight">Connect a device</h1>
        {code || params.error ? (
          <div className="mt-4">
            <Callout tone="danger">
              That code has expired or was already used. Run npx sealcode login again.
            </Callout>
          </div>
        ) : null}
        <form action="/device" className="mt-6 space-y-4">
          <Field label="Code shown in your terminal">
            <input
              name="code"
              required
              placeholder="BCDF-GHJK"
              autoFocus
              className={`${inputClass} font-mono uppercase tracking-widest`}
            />
          </Field>
          <SubmitButton className="w-full">Continue</SubmitButton>
        </form>
      </>
    );
  } else if (orgs.length === 0) {
    body = (
      <>
        <h1 className="font-display text-4xl tracking-tight">No organisation yet</h1>
        <p className="mt-2 text-sm text-muted">
          <Link href="/onboarding" className="text-seal hover:underline">
            Create an organisation
          </Link>{' '}
          or accept an invitation first.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="font-display text-4xl tracking-tight">Approve this device?</h1>
        <p className="mt-2 text-sm text-muted">
          The Sealcode CLI on <strong className="text-ink">{pending.clientName}</strong> is asking
          for an API key for <strong className="text-ink">{s.user.email}</strong>. Check that your
          terminal shows this code:
        </p>
        <p className="my-5 rounded-lg border border-line bg-surface-2 py-3 text-center font-mono text-2xl tracking-[0.25em]">
          {pending.userCode}
        </p>
        <form action={approveDevice.bind(null, pending.userCode)} className="space-y-4">
          {orgs.length > 1 ? (
            <Field label="Organisation">
              <select
                name="orgId"
                defaultValue={s.session.activeOrgId ?? orgs[0]!.id}
                className={inputClass}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <input type="hidden" name="orgId" value={orgs[0]!.id} />
          )}
          <SubmitButton className="w-full" pendingLabel="Approving…">
            Approve and create key
          </SubmitButton>
        </form>
        <form action={denyDevice.bind(null, pending.userCode)} className="mt-2">
          <SubmitButton variant="ghost" className="w-full">
            Deny
          </SubmitButton>
        </form>
        <p className="mt-4 text-xs text-muted">
          Didn&rsquo;t run npx sealcode login just now? Deny this request.
        </p>
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-10">
      <Link href="/app" aria-label="Sealcode dashboard">
        <Logo />
      </Link>
      <Card className="mt-10 w-full max-w-md p-8">{body}</Card>
    </div>
  );
}
