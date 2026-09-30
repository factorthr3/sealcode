import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatTokens, TRIAL } from '@sealcode/shared';
import { Card } from '@/components/ui';
import { getSession } from '@/lib/session';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = { title: 'Create your organisation' };

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  const s = await getSession();
  if (!s) redirect('/login?next=/onboarding');
  const { name } = await searchParams;
  return (
    <Card className="p-8">
      <h1 className="font-display text-4xl tracking-tight">Create your organisation</h1>
      <p className="mt-2 mb-6 text-sm text-muted">
        Your {TRIAL.days}-day trial includes {TRIAL.maxSeats} seats and{' '}
        {formatTokens(TRIAL.pooledTokens)} tokens. When you&rsquo;re ready, contact us to activate a
        plan. No card needed now. There&rsquo;s one trial per company email domain.
      </p>
      <OnboardingForm defaultName={typeof name === 'string' ? name.slice(0, 120) : ''} />
    </Card>
  );
}
