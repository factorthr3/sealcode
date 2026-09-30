import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form-controls';
import { Logo } from '@/components/logo';
import { ButtonLink, Callout, Card } from '@/components/ui';
import { acc } from '@/lib/db';
import { ROLE_LABELS } from '@/lib/permissions';
import { getSession } from '@/lib/session';
import { acceptInvitation } from '../../(auth)/actions';

export const metadata: Metadata = { title: 'Join your team', robots: { index: false } };

const ERRORS: Record<string, string> = {
  invalid: 'This invitation has expired or was withdrawn. Ask your admin for a new one.',
  email_mismatch:
    'This invitation was sent to a different email address. Sign in with that address to accept it.',
};

export default async function InvitePage({ params, searchParams }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await acc().inviteByToken(token);
  const session = await getSession();
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-10">
      <Link href="/" aria-label="Sealcode home">
        <Logo />
      </Link>
      <Card className="mt-10 w-full max-w-md p-8">
        {typeof error === 'string' && ERRORS[error] ? (
          <div className="mb-4">
            <Callout tone="danger">{ERRORS[error]}</Callout>
          </div>
        ) : null}
        {!invite ? (
          <>
            <h1 className="font-display text-4xl tracking-tight">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-muted">{ERRORS.invalid}</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl tracking-tight">Join {invite.orgName}</h1>
            <p className="mt-2 text-sm text-muted">
              You&rsquo;ve been invited as {ROLE_LABELS[invite.invite.role].toLowerCase()} (
              {invite.invite.email}). Sealcode runs your AI coding requests inside hardware
              enclaves, with a receipt for each.
            </p>
            <div className="mt-6">
              {session ? (
                <form action={acceptInvitation.bind(null, token)}>
                  <SubmitButton className="w-full" pendingLabel="Joining…">
                    Accept invitation
                  </SubmitButton>
                </form>
              ) : (
                <ButtonLink
                  href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="w-full"
                >
                  Sign in to accept
                </ButtonLink>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
