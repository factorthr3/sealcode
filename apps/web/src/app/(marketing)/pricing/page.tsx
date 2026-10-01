import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUsd, MODEL_ALIASES, OVERAGE_PER_MTOK, SALES_EMAIL } from '@sealcode/shared';
import { PricingCards } from '@/components/pricing-cards';
import { ButtonLink, Table } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Team and Business are priced per seat with a pooled token allowance and published overage rates; Enterprise is priced with you. Contact us to get started; we invoice you directly.',
};

const FAQ = [
  [
    'How do we buy Sealcode?',
    `Contact us with your plan and seat count. We send an order form and an invoice, set up your organisation and invite your admins. We don’t take cards online. UK VAT is added where it applies. Email ${SALES_EMAIL} with procurement requirements.`,
  ],
  [
    'How is Enterprise priced?',
    'Individually: a platform fee and seats agreed for your organisation’s size, with a dedicated CVM, custom domain, SLA and security review support. Talk to us and we’ll put together a proposal.',
  ],
  [
    'Can we try it before we buy?',
    'Yes. The playground on our homepage runs on the real confidential stack, with no sign-up. For a hands-on evaluation with your own repositories, we set up time-limited pilots for design partners.',
  ],
  [
    'What counts towards the allowance?',
    'Every token a request uses: input (including prompt-cache reads and writes) and output. The allowance is pooled across your organisation for the calendar month (UTC), so a heavy user and a light user share it.',
  ],
  [
    'What happens if we use more than our allowance?',
    'By default your admins get emails at 50%, 80% and 100%, and usage continues at the overage rates below. Prefer a ceiling? Switch budgets to hard stop: requests are refused with a clear message in Claude Code until next month or until an admin raises the cap. You can also cap individual seats.',
  ],
  [
    'Can we see what we’ll be billed?',
    'Yes. The dashboard’s billing page shows each month’s statement (seat fees, pooled allowance, tokens used and overage), calculated from your audit log, with a CSV export. It’s the same calculation we invoice from.',
  ],
] as const;

export default function PricingPage() {
  return (
    <div className="px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-seal">Pricing</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
          Priced per seat, with the tokens pooled.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">
          Every plan includes the confidential gateway, dashboard, metadata-only audit log and trust
          center. Seats come with a monthly token allowance that the whole organisation shares.
        </p>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-seal/30 bg-seal-soft px-6 py-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold">Ready to start?</p>
            <p className="text-sm text-ink-2">
              Tell us your plan and seats; we&rsquo;ll send an order form, usually within one
              working day. Want to see it first?{' '}
              <Link href="/#playground" className="underline underline-offset-2">
                Try the playground
              </Link>
              .
            </p>
          </div>
          <ButtonLink href="/contact?reason=pricing">Contact sales</ButtonLink>
        </div>

        <h2 className="sr-only">Plans</h2>
        <div className="mt-12">
          <PricingCards />
        </div>

        <div className="mt-20 grid grid-cols-1 gap-12 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-3xl">Overage rates</h2>
            <p className="mt-2 text-sm text-muted">
              Team and Business, per 1M tokens beyond your pooled monthly allowance, on any model.
              Enterprise rates are set in your agreement.
            </p>
            <div className="mt-5">
              <Table>
                <thead>
                  <tr>
                    <th>Token type</th>
                    <th className="text-right">Per 1M tokens</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Input</td>
                    <td className="text-right tabular-nums">
                      {formatUsd(OVERAGE_PER_MTOK.input, { cents: true })}
                    </td>
                  </tr>
                  <tr>
                    <td>Cached input (prompt-cache reads)</td>
                    <td className="text-right tabular-nums">
                      {formatUsd(OVERAGE_PER_MTOK.cachedInput, { cents: true })}
                    </td>
                  </tr>
                  <tr>
                    <td>Output</td>
                    <td className="text-right tabular-nums">
                      {formatUsd(OVERAGE_PER_MTOK.output, { cents: true })}
                    </td>
                  </tr>
                </tbody>
              </Table>
            </div>
          </section>
          <section>
            <h2 className="font-display text-3xl">Models</h2>
            <p className="mt-2 text-sm text-muted">
              You use stable aliases, so we can move you to better models without any change on your
              side.
            </p>
            <div className="mt-5">
              <Table>
                <thead>
                  <tr>
                    <th>Alias</th>
                    <th>Model</th>
                    <th>Used for</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(MODEL_ALIASES).map((m) => (
                    <tr key={m.id}>
                      <td className="font-mono text-xs">{m.id}</td>
                      <td>{m.id === 'sealcode-pro' ? 'GLM 5.3' : 'GLM 5.3 Flash'}</td>
                      <td className="text-ink-2">
                        {m.id === 'sealcode-pro'
                          ? 'Main coding work'
                          : 'Background tasks and quick edits'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </section>
        </div>

        <section className="mt-20">
          <h2 className="font-display text-3xl">Pricing questions</h2>
          <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span aria-hidden className="text-xl text-muted transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl text-ink-2">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
