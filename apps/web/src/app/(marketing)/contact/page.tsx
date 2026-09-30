import type { Metadata } from 'next';
import { SALES_EMAIL, SECURITY_EMAIL } from '@sealcode/shared';
import { Card } from '@/components/ui';
import { getSession } from '@/lib/session';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact sales',
  description:
    'Activate a Sealcode plan, arrange a pilot or start a security review. We reply within one working day.',
};

const STEPS = [
  ['Tell us what you need', 'Plan, seats and any procurement or security steps on your side.'],
  [
    'Get an order form',
    'We send an order form and invoice in GBP or USD, usually within a working day. UK VAT is added where it applies.',
  ],
  [
    'We activate your organisation',
    'Your trial becomes your paid plan in place. Keys, members and audit history carry over.',
  ],
] as const;

export default async function ContactPage({ searchParams }: PageProps<'/contact'>) {
  const q = await searchParams;
  const s = await getSession();
  const pick = (v: string | string[] | undefined) =>
    typeof v === 'string' ? v.slice(0, 40) : undefined;
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:py-24">
      <div>
        <p className="text-sm font-medium text-seal">Contact sales</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
          Activate, pilot or review.
        </h1>
        <p className="mt-5 max-w-md text-lg text-ink-2">
          We don&rsquo;t take cards online yet. Tell us about your team and we&rsquo;ll set you up
          properly, with an order form, invoice and DPA.
        </p>
        <ol className="mt-10 space-y-6">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-seal/40 font-mono text-sm text-seal">
                {i + 1}
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <dl className="mt-10 space-y-2 text-sm">
          <div>
            <dt className="inline text-muted">Sales: </dt>
            <dd className="inline">
              <a href={`mailto:${SALES_EMAIL}`} className="text-seal hover:underline">
                {SALES_EMAIL}
              </a>
            </dd>
          </div>
          <div>
            <dt className="inline text-muted">Security: </dt>
            <dd className="inline">
              <a href={`mailto:${SECURITY_EMAIL}`} className="text-seal hover:underline">
                {SECURITY_EMAIL}
              </a>
            </dd>
          </div>
        </dl>
      </div>
      <Card className="p-6 sm:p-8">
        <ContactForm
          defaults={{
            plan: pick(q.plan),
            seats: pick(q.seats),
            reason: pick(q.reason),
            email: s?.user.email,
            company: s?.orgs.find((o) => o.id === s.session.activeOrgId)?.name,
          }}
        />
      </Card>
    </div>
  );
}
