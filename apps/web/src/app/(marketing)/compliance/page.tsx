import type { Metadata } from 'next';
import Link from 'next/link';
import { SECURITY_EMAIL } from '@sealcode/shared';
import { Badge, ButtonLink, Card, Table } from '@/components/ui';
import { subprocessors } from '@/lib/content';
import { inConfidentialVm } from '@/lib/hosting';

export const metadata: Metadata = {
  title: 'Compliance',
  description: 'Subprocessors, data processing agreement and certification roadmap for Sealcode.',
};

const ROADMAP = [
  {
    item: 'Data processing agreement (UK GDPR and EU GDPR, with SCCs where needed)',
    status: 'Available',
    tone: 'verified',
  },
  {
    item: 'Security questionnaire support (CAIQ-lite, bespoke)',
    status: 'Available',
    tone: 'verified',
  },
  { item: 'Published threat model and trust boundary', status: 'Available', tone: 'verified' },
  { item: 'Independent penetration test', status: 'Before general availability', tone: 'warn' },
  { item: 'SOC 2 Type I', status: 'Planned', tone: 'neutral' },
  { item: 'ISO/IEC 27001', status: 'Under consideration', tone: 'neutral' },
] as const;

export default async function CompliancePage() {
  const tee = await inConfidentialVm();
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
      <p className="text-sm font-medium text-seal">Compliance</p>
      <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
        Built for teams with GDPR and FCA obligations.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-2">
        We hold no certifications yet, and we won&rsquo;t claim any before an audit. Here is what we
        can offer today, and what&rsquo;s coming.
      </p>

      <section className="mt-14">
        <h2 className="mb-4 text-xl font-semibold">Status</h2>
        <Table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ROADMAP.map((r) => (
              <tr key={r.item}>
                <td>{r.item}</td>
                <td>
                  <Badge tone={r.tone}>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="mt-14">
        <h2 className="mb-2 text-xl font-semibold">Subprocessors</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Our DPA sets out how we tell you about changes to this list. Stripe would be added if we
          move to online payments.
        </p>
        <Table>
          <thead>
            <tr>
              <th>Subprocessor</th>
              <th>Purpose</th>
              <th>Data</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {subprocessors(tee).map((s) => (
              <tr key={s.name} className="align-top">
                <td className="font-medium">{s.name}</td>
                <td className="text-ink-2">{s.purpose}</td>
                <td className="text-ink-2">{s.data}</td>
                <td className="text-ink-2">{s.location}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Data processing agreement</h2>
          <p className="mt-2 text-sm text-muted">
            Our DPA covers Sealcode as processor, the subprocessors above, the technical measures on
            our{' '}
            <Link href="/security" className="underline">
              security page
            </Link>
            , and deletion on termination. Business and Enterprise plans include it; ask us for a
            copy at any stage.
          </p>
          <ButtonLink
            href="/contact?reason=security"
            variant="secondary"
            size="sm"
            className="mt-4"
          >
            Request the DPA
          </ButtonLink>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Security reviews</h2>
          <p className="mt-2 text-sm text-muted">
            We&rsquo;ll complete your questionnaire and walk your security team through the
            attestation live. Vulnerability reports go to{' '}
            <a href={`mailto:${SECURITY_EMAIL}`} className="underline">
              {SECURITY_EMAIL}
            </a>
            .
          </p>
          <ButtonLink
            href="/contact?reason=security"
            variant="secondary"
            size="sm"
            className="mt-4"
          >
            Start a security review
          </ButtonLink>
        </Card>
      </section>
    </div>
  );
}
