import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '@/components/code-block';
import { HeroVisual } from '@/components/hero-visual';
import { HowItWorks } from '@/components/how-it-works';
import { PlaygroundLazy } from '@/components/playground-lazy';
import { PricingCards } from '@/components/pricing-cards';
import { ButtonLink } from '@/components/ui';
import { canSee, cannotSee } from '@/lib/content';
import { inConfidentialVm } from '@/lib/hosting';
import { formatUsd, PLANS } from '@sealcode/shared';

export const metadata: Metadata = {
  title: { absolute: 'Sealcode: AI coding for teams that can’t send code to the cloud' },
  description:
    'Use Claude Code, OpenCode, Cline and Continue with strong open models running inside hardware enclaves. A verifiable receipt for every request, and no prompts stored. Try it live, then talk to us about pricing.',
};

function proof(tee: boolean) {
  return [
    tee
      ? ['Intel TDX + NVIDIA', 'confidential computing, end to end']
      : ['NVIDIA GPU TEEs', 'confidential model inference'],
    ['GLM 5.3', 'strong open model, 1M-token context'],
    ['0 prompts', 'stored or logged by Sealcode'],
    tee
      ? ['Open source', 'gateway, with published attestation']
      : ['Open source', 'gateway code, public on GitHub'],
  ] as const;
}

const pillars = (tee: boolean) => [
  {
    title: 'Sealed',
    body: tee
      ? 'Every request is processed inside hardware enclaves: our gateway, Phala’s attested router and the model’s GPU TEE. TLS terminates inside the enclave, not at a proxy in front of it.'
      : 'Inference runs only on GPU enclaves behind Phala’s attested router, with no fallback to an ordinary GPU. Our gateway never logs or stores prompts, and is moving into a Confidential VM.',
    icon: 'M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3z M9 12l2 2 4-4',
  },
  {
    title: 'Proven',
    body: tee
      ? 'We publish the attestation for the exact code that handles your requests, and every response carries a signed receipt your admins can verify from the audit log.'
      : 'Every response carries a receipt signed by Phala’s attested router, which your admins can verify from the audit log. Our gateway’s source is public.',
    icon: 'M6 3h9l3 3v15l-2-1-2 1-2-1-2 1-2-1-2 1V3z M9 8h6 M9 12h6 M9 16h3',
  },
  {
    title: 'Familiar',
    body: 'Works with Claude Code, OpenCode, Cline and Continue. One command configures a developer’s machine and keeps their other settings.',
    icon: 'M4 5h16v11H4z M8 20h8 M12 16v4 M8 9l2 2-2 2 M12 13h4',
  },
  {
    title: 'Controlled',
    body: 'Seats, per-device keys, rate limits, org and seat budgets with a hard stop or soft alert, and a full audit log of request metadata, exportable as CSV.',
    icon: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M14 4v4 M8 10v4 M16 16v4',
  },
];

const SEGMENTS = [
  [
    'Fintech and payments',
    'FCA outsourcing rules and client confidentiality mean source code can’t go to a standard AI API.',
  ],
  [
    'Legal tech',
    'Privileged client data turns up in code, fixtures and test data. Keep inference inside enclaves.',
  ],
  [
    'Health tech and NHS suppliers',
    'Patient data in fixtures and DSPT obligations call for processing you can evidence.',
  ],
  [
    'Government and defence suppliers',
    'Contractual data-handling clauses, with an attestation your assurance team can check.',
  ],
] as const;

const FAQ = [
  {
    q: 'Does my code go to Anthropic?',
    a: 'No. Claude Code is only the client on your laptop; its model requests go to Sealcode and on to open models in TEEs. Our CLI sets CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1, which stops Claude Code’s telemetry and update checks. One exception: Claude Code’s WebFetch tool asks api.anthropic.com whether a domain is safe before fetching it. That check sends the domain, not your code, and you can turn it off with skipWebFetchPreflight.',
  },
  {
    q: 'Which models do I get?',
    a: 'sealcode-pro runs GLM 5.3 (1M-token context) for main coding work, and sealcode-fast runs GLM 5.3 Flash for background tasks and quick edits. Claude Code’s opus and sonnet tiers map to sealcode-pro, and its haiku tier to sealcode-fast. We’ll add more models as they become available in TEEs.',
  },
  {
    q: 'Is it as capable as Claude?',
    a: 'No: these are strong open models, not Claude. They handle everyday coding well: reading code, editing files, writing tests and running commands through Claude Code’s tools. If your policies block standard AI APIs, the choice is between these and nothing. Try the playground above, or run your own tasks in a pilot.',
  },
  {
    q: 'What exactly can Sealcode see?',
    a: 'Request metadata: who, which key, which model, token counts, latency, status and the receipt ID. Never prompts, code or completions: they aren’t logged or stored, and our logger rejects any field that isn’t on an allowlist. Our gateway does handle the plaintext inside the enclave, which is why its source is public and its attestation verifiable.',
  },
  {
    q: 'How do I verify any of this?',
    a: 'The trust center shows the live hardware attestation and the compose hash of what’s running. Clone the repository at the attested commit and run our verification script. Each request in your audit log also has a Verify button that checks its Phala receipt.',
  },
  {
    q: 'How does pricing work?',
    a: `Team is ${formatUsd(PLANS.team.pricePerSeatMonthly ?? 0)} and Business ${formatUsd(PLANS.business.pricePerSeatMonthly ?? 0)} per seat a month, each with a pooled monthly token allowance; Enterprise is priced individually. There’s no card checkout: contact us, and we send an order form and invoice, then set up your organisation and invite your admins. Design partners can start with a time-limited pilot.`,
  },
  {
    q: 'Do you support SSO and SCIM?',
    a: 'SSO and SCIM ship with the Business plan after launch. Today, sign-in is by email link, with mandatory two-factor sign-in for owners and admins.',
  },
  {
    q: 'Is Sealcode affiliated with Anthropic?',
    a: 'No. Sealcode works with Claude Code, but it isn’t affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.',
  },
];

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-seal">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
          {title}
        </h2>
        {intro ? <p className="mt-4 max-w-2xl text-lg text-ink-2">{intro}</p> : null}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const tee = await inConfidentialVm();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-14 pb-10 sm:px-6 lg:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(circle_at_85%_20%,var(--seal-soft),transparent_45%),radial-gradient(circle_at_10%_90%,var(--verified-soft),transparent_40%)]"
        />
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
              <span className="size-1.5 rounded-full bg-seal" aria-hidden />
              Confidential AI coding, with receipts
            </p>
            <h1 className="mt-6 font-display text-[3.2rem] leading-[0.98] tracking-tight sm:text-7xl">
              <strong className="block font-bold text-seal">Privacy.</strong>
              AI coding for teams that can&rsquo;t send code to the cloud.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-2 sm:text-xl">
              Sealcode runs Claude Code, OpenCode, Cline and Continue against strong open models
              inside hardware enclaves. Every response comes with a receipt you can verify, and we
              never store your prompts.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="#playground" size="lg">
                Try it live
              </ButtonLink>
              <ButtonLink href="/pricing" size="lg" variant="secondary">
                See pricing
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">
              Try the playground with no sign-up. Team plans from{' '}
              {formatUsd(PLANS.team.pricePerSeatMonthly ?? 0)} per seat a month.
            </p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* Proof strip */}
      <section aria-label="At a glance" className="border-y border-line bg-surface/70 px-4 sm:px-6">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          {proof(tee).map(([big, small]) => (
            <div key={big} className="px-2 py-6 lg:px-6">
              <dt className="font-display text-2xl sm:text-3xl">{big}</dt>
              <dd className="mt-1 text-sm text-muted">{small}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Playground */}
      <Section
        id="playground"
        eyebrow="Try it before you buy"
        title="Ask a coding question. Get an answer, and a receipt."
        intro={
          <>
            This is the real path, not a demo video. Your question goes from this page to our
            gateway, through Phala&rsquo;s attested router and into a GPU enclave. Then check the
            receipt yourself. No sign-up needed.
          </>
        }
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_17rem]">
          <PlaygroundLazy />
          <aside className="space-y-5 text-sm">
            <div>
              <p className="font-semibold">What happens when you press send</p>
              <ol className="mt-3 space-y-3 text-ink-2">
                {[
                  'Your browser gets a 15-minute playground token.',
                  'It sends your question straight to the Sealcode gateway. Our website never sees it.',
                  'The gateway requires a TEE route and forwards it to the model’s enclave.',
                  'The answer streams back with a receipt ID. Press Verify to fetch the signed receipt.',
                ].map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-seal-soft font-mono text-[11px] text-seal">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="font-semibold">Want it on your own repo?</p>
              <p className="mt-1 text-ink-2">
                A pilot connects your team&rsquo;s Claude Code in one command, with tools, files and
                tests.
              </p>
              <ButtonLink href="/contact?reason=pilot" size="sm" className="mt-3 w-full">
                Talk to us about a pilot
              </ButtonLink>
            </div>
          </aside>
        </div>
      </Section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="scroll-mt-20 bg-surface-2/60 px-4 py-20 sm:px-6 lg:py-28"
      >
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-seal">How it works</p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            Your laptop is the only place your code exists outside an enclave.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-ink-2">
            Three hops, all in hardware-isolated memory, with proof attached to every response. No
            GPUs to run and no ML ops.
          </p>
          <div className="mt-12">
            <HowItWorks tee={tee} />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <Section
        eyebrow="Why Sealcode"
        title="Policy-based privacy asks you to trust a promise. We give you evidence."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {pillars(tee).map((p) => (
            <div key={p.title} className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
              <svg
                viewBox="0 0 24 24"
                className="size-8 text-seal"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={p.icon} />
              </svg>
              <h3 className="mt-4 font-display text-3xl">{p.title}</h3>
              <p className="mt-2 text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* One command */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-10 rounded-3xl bg-code-bg p-6 text-code-ink sm:p-10 lg:grid-cols-2 lg:p-14">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#ff9b6a]">Setup</p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl">
              One command per developer.
            </h2>
            <p className="mt-4 text-code-muted">
              The CLI approves the device in the browser, creates a key for that laptop, and merges
              the settings into Claude Code. It keeps your other settings and backs up the original.{' '}
              <code className="text-code-ink">sealcode doctor</code> catches conflicts;{' '}
              <code className="text-code-ink">sealcode logout</code> puts everything back.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-code-ink">
              <li>✓ macOS, Linux and Windows PowerShell</li>
              <li>✓ One revocable key per developer per device</li>
              <li>✓ Stops Claude Code&rsquo;s telemetry and update checks</li>
            </ul>
          </div>
          <CodeBlock
            label="Terminal"
            code={`$ npx sealcode login
  Your one-time code: BCDF-GHJK
  Approve it at https://sealcode.ai/device

✓ Signed in as priya@acme-pay.co.uk (Acme Payments)
✓ Claude Code now uses api.sealcode.ai
✓ Settings merged; original backed up

$ claude`}
          />
        </div>
      </section>

      {/* Trust boundary */}
      <Section
        eyebrow="Honest trust boundary"
        title="What we can see, and what we can’t."
        intro={
          <>
            {tee ? (
              <>
                Your code is processed inside hardware-isolated enclaves, and we publish proof of
                the exact code that handles it. We don&rsquo;t claim no one could ever see it.
                Here&rsquo;s precisely where the line is.
              </>
            ) : (
              <>
                Inference runs inside hardware-isolated GPU enclaves, with a signed receipt for
                every response. Our own gateway isn&rsquo;t in an enclave yet. Here&rsquo;s
                precisely where the line is today.
              </>
            )}
          </>
        }
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <h3 className="font-semibold">Sealcode can see</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-2">
              {canSee(tee).map((s) => (
                <li key={s} className="flex gap-2">
                  <span aria-hidden className="text-muted">
                    ○
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-verified/30 bg-verified-soft/50 p-6">
            <h3 className="font-semibold">Sealcode can&rsquo;t see</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-2">
              {cannotSee(tee).map((s) => (
                <li key={s} className="flex gap-2">
                  <span aria-hidden className="text-verified">
                    ●
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/security" variant="secondary">
            Read the security overview
          </ButtonLink>
          <ButtonLink href="/trust" variant="ghost">
            See the live attestation →
          </ButtonLink>
        </div>
      </Section>

      {/* Segments */}
      <section className="bg-surface-2/60 px-4 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-seal">
            Built for regulated engineering teams
          </p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            Built for teams with GDPR and FCA obligations.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SEGMENTS.map(([t, b]) => (
              <div key={t} className="rounded-xl border border-line bg-surface p-5">
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <Section
        id="pricing"
        eyebrow="Pricing"
        title="Per seat, with a pooled token allowance."
        intro={
          <>
            Team and Business have published per-seat prices; Enterprise is priced with you. Contact
            us to get started and we invoice you directly.{' '}
            <Link href="/pricing" className="text-seal underline underline-offset-2">
              Full pricing →
            </Link>
          </>
        }
      >
        <PricingCards compact />
      </Section>

      {/* FAQ */}
      <Section eyebrow="Questions" title="The things security teams ask first.">
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span aria-hidden className="text-xl text-muted transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-3xl text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-6 py-14 text-paper sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-seal/30 blur-3xl"
          />
          <h2 className="relative max-w-2xl font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            {tee ? 'Your code stays sealed.' : 'Your code stays private.'} Your developers stay
            fast.
          </h2>
          <p className="relative mt-4 max-w-xl text-lg text-paper/75">
            Try the playground now, then talk to us about pricing, a pilot with your own code, or a
            security review.
          </p>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/contact?reason=pricing" size="lg">
              Contact sales
            </ButtonLink>
            <ButtonLink
              href="/contact?reason=pilot"
              size="lg"
              variant="ghost"
              className="text-paper hover:bg-white/10 hover:text-paper"
            >
              Book a pilot →
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
