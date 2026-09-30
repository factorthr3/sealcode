import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  return (
    <Card className="p-8">
      <h1 className="font-display text-4xl tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        We&rsquo;ll email you a one-time link. No passwords to leak.
      </p>
      <div className="mt-6">
        <LoginForm next={typeof next === 'string' ? next : undefined} />
      </div>
      <p className="mt-6 text-sm text-muted">
        New to Sealcode?{' '}
        <Link href="/signup" className="font-medium text-seal hover:underline">
          Start a free trial
        </Link>
      </p>
    </Card>
  );
}
