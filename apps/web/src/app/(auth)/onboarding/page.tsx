import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SALES_EMAIL } from '@sealcode/shared';
import { SubmitButton } from '@/components/form-controls';
import { ButtonLink, Card } from '@/components/ui';
import { getSession } from '@/lib/session';
import { signOut } from '../actions';

export const metadata: Metadata = { title: 'Almost there' };

/** Signed in, but not a member of any organisation yet. Organisations are created by Sealcode. */
export default async function OnboardingPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.orgs.length > 0) redirect('/app');
  return (
    <Card className="p-8">
      <h1 className="font-display text-4xl tracking-tight">
        You&rsquo;re not in an organisation yet
      </h1>
      <p className="mt-3 text-sm text-ink-2">
        You&rsquo;re signed in as <strong className="text-ink">{s.user.email}</strong>. Sealcode
        organisations are set up by our team once pricing is agreed. If your company already uses
        Sealcode, ask one of its admins to invite this email address.
      </p>
      <div className="mt-6 grid gap-2">
        {s.user.isStaff ? (
          <ButtonLink href="/staff">Create an organisation in the staff console</ButtonLink>
        ) : (
          <ButtonLink href="/contact?reason=pricing">Contact sales</ButtonLink>
        )}
        <form action={signOut}>
          <SubmitButton variant="ghost" className="w-full">
            Sign out
          </SubmitButton>
        </form>
      </div>
      <p className="mt-6 text-xs text-muted">
        Questions? Email{' '}
        <a href={`mailto:${SALES_EMAIL}`} className="underline">
          {SALES_EMAIL}
        </a>
        .
      </p>
    </Card>
  );
}
