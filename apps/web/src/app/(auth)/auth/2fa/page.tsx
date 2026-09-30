import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { SubmitButton } from '@/components/form-controls';
import { Card } from '@/components/ui';
import { getSession } from '@/lib/session';
import { decryptSecret, otpauthUri } from '@/lib/totp';
import { startTotpSetup } from '../../actions';
import { CodeForm } from './code-form';

export const metadata: Metadata = { title: 'Two-factor sign-in', robots: { index: false } };

export default async function TwoFactorPage({ searchParams }: PageProps<'/auth/2fa'>) {
  const { next: rawNext } = await searchParams;
  const next =
    typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/app';
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (s.session.mfaVerifiedAt) redirect(next);

  if (s.user.totpEnabledAt && s.user.totpSecretEnc) {
    return (
      <Card className="p-8">
        <h1 className="font-display text-4xl tracking-tight">Two-factor sign-in</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          Enter the code from your authenticator app for {s.user.email}.
        </p>
        <CodeForm next={next} label="Verify" />
      </Card>
    );
  }

  if (!s.user.totpSecretEnc) {
    return (
      <Card className="p-8">
        <h1 className="font-display text-4xl tracking-tight">Protect your account</h1>
        <p className="mt-3 text-sm text-ink-2">
          Owners and admins control keys, budgets and the audit log, so Sealcode requires two-factor
          sign-in for them. You&rsquo;ll need an authenticator app such as 1Password, Google
          Authenticator or Microsoft Authenticator.
        </p>
        <form action={startTotpSetup} className="mt-6">
          <input type="hidden" name="next" value={next} />
          <SubmitButton className="w-full" pendingLabel="Preparing…">
            Set up authenticator
          </SubmitButton>
        </form>
      </Card>
    );
  }

  const secret = decryptSecret(s.user.totpSecretEnc);
  const svg = await QRCode.toString(otpauthUri(secret, s.user.email), {
    type: 'svg',
    margin: 1,
    width: 200,
  });
  return (
    <Card className="p-8">
      <h1 className="font-display text-4xl tracking-tight">Scan with your authenticator</h1>
      <p className="mt-2 text-sm text-muted">
        Scan the code, then enter the 6-digit code it shows.
      </p>
      <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt="QR code for your authenticator app"
          width={180}
          height={180}
          className="rounded-lg border border-line bg-white p-2"
        />
        <div className="min-w-0 text-sm">
          <p className="text-muted">Can&rsquo;t scan? Enter this key:</p>
          <p className="mt-1 break-all font-mono text-ink">{secret.match(/.{1,4}/g)?.join(' ')}</p>
        </div>
      </div>
      <div className="mt-6">
        <CodeForm next={next} label="Turn on two-factor sign-in" />
      </div>
    </Card>
  );
}
