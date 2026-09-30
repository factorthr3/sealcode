import type { Metadata } from 'next';
import { Card } from '@/components/ui';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

/**
 * The link is consumed on POST, not GET, so email security scanners that prefetch links can't
 * use it up before the person clicks.
 */
export default async function VerifyPage({ searchParams }: PageProps<'/auth/verify'>) {
  const { token } = await searchParams;
  return (
    <Card className="p-8">
      <h1 className="font-display text-4xl tracking-tight">Almost there</h1>
      <p className="mt-2 mb-6 text-sm text-muted">Confirm it&rsquo;s you to finish signing in.</p>
      <VerifyForm token={typeof token === 'string' ? token : ''} />
    </Card>
  );
}
