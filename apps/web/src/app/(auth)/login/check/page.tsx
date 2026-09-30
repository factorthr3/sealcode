import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, Card } from '@/components/ui';
import { devMailbox } from '@/lib/email';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Check your email' };

export default async function CheckEmailPage({ searchParams }: PageProps<'/login/check'>) {
  const { email } = await searchParams;
  const address = typeof email === 'string' ? email : '';
  // Local development without an email provider: surface the link so sign-in still works.
  const devLink =
    !env().production && !env().RESEND_API_KEY
      ? devMailbox()
          .find((m) => m.to === address)
          ?.text.match(/https?:\/\/\S+/)?.[0]
      : undefined;
  return (
    <Card className="p-8">
      <h1 className="font-display text-4xl tracking-tight">Check your email</h1>
      <p className="mt-3 text-sm text-ink-2">
        We sent a sign-in link to <strong className="text-ink">{address || 'your inbox'}</strong>.
        It works once and expires in 15 minutes.
      </p>
      {devLink ? (
        <div className="mt-6">
          <Callout tone="warn" title="Development mode: no email provider configured">
            <a href={devLink}>Open the sign-in link</a>
          </Callout>
        </div>
      ) : null}
      <p className="mt-6 text-sm text-muted">
        Wrong address?{' '}
        <Link href="/login" className="font-medium text-seal hover:underline">
          Try again
        </Link>
      </p>
    </Card>
  );
}
