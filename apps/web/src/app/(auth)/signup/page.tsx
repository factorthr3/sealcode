import type { Metadata } from 'next';
import Link from 'next/link';
import { formatTokens, TRIAL } from '@sealcode/shared';
import { Card } from '@/components/ui';
import { LoginForm } from '../login/login-form';

export const metadata: Metadata = { title: 'Start a free trial' };

export default function SignupPage() {
  return (
    <Card className="p-8">
      <h1 className="font-display text-4xl tracking-tight">Start your free trial</h1>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
        <li>✓ {TRIAL.days} days, no card required</li>
        <li>
          ✓ Up to {TRIAL.maxSeats} seats: you and {TRIAL.maxSeats - 1} teammates
        </li>
        <li>✓ {formatTokens(TRIAL.pooledTokens)} tokens on GLM 5.3, inside hardware enclaves</li>
      </ul>
      <div className="mt-6">
        <LoginForm withCompany />
      </div>
      <p className="mt-6 text-xs text-muted">
        By starting a trial you agree to our{' '}
        <Link href="/legal/terms" className="underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" className="underline">
          privacy policy
        </Link>
        . Already have an account?{' '}
        <Link href="/login" className="font-medium text-seal hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
