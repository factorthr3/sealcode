import type { Metadata } from 'next';
import Link from 'next/link';
import { SECURITY_EMAIL } from '@sealcode/shared';
import { Callout, Card } from '@/components/ui';
import { CAN_SEE, CANNOT_SEE } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Security',
  description:
    'Sealcode’s trust boundary, request path and controls: what we can see, what we can’t, and what sits outside the boundary.',
};

const PATH = [
  [
    'Claude Code sends the request to api.sealcode.dev',
    'TLS terminates inside our Confidential VM, not at a proxy in front of it. The certificate’s private key is generated inside the TEE.',
  ],
  [
    'The gateway authenticates your key',
    'Keys are stored only as HMAC-SHA256 hashes with a secret pepper held in the TEE. A revoked key stops working within five seconds.',
  ],
  [
    'Limits and budgets are checked',
    'Per-key rate limits and org and seat budgets. A hard stop returns a readable error in Claude Code.',
  ],
  [
    'The request is pinned to a TEE route',
    'The gateway rewrites the model alias and adds provider {"aci_verified": true, "zdr": true}, discarding any routing the client sent. There is no fallback to an ordinary GPU.',
  ],
  [
    'Phala’s attested gateway forwards it to the model’s GPU enclave',
    'Inference runs inside confidential computing hardware with zero data retention.',
  ],
  [
    'The response streams back unchanged',
    'Apart from the model name, bytes pass through as the upstream sent them. Errors are passed through too, so Claude Code’s automatic recovery keeps working.',
  ],
  [
    'Metadata is recorded',
    'Time, key, model, token counts, latency, status and the receipt ID. Never the content.',
  ],
] as const;

const CONTROLS = [
  [
    'No content persistence',
    'Request and response bodies are never logged, stored, cached to disk or sent to third parties, including error trackers. Services log through an allowlist-only logger that rejects free text, and a test scans the whole gateway suite’s output for prompt text.',
  ],
  [
    'Enclave-only upstream',
    'Every upstream call requires aci_verified routing, and zero data retention where a route exists. In production the upstream address is compiled into the attested image, so it can’t be redirected by configuration.',
  ],
  [
    'Reproducible, published code',
    'Images are pinned by digest, lockfiles are committed and the compose file is published, so the attestation hash means something you can check.',
  ],
  [
    'Secrets sealed in the TEE',
    'Upstream credentials, the database password, the key pepper and encryption keys are Phala sealed environment variables, readable only inside the enclave.',
  ],
  [
    'Tenant isolation',
    'Every dashboard query is scoped to your organisation in SQL, with tests that point every data function at another organisation’s IDs.',
  ],
  [
    'Admin protection',
    'Two-factor sign-in is mandatory for owners and admins. Sign-in links are single use, expire in 15 minutes and survive email link scanners.',
  ],
] as const;

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
      <p className="text-sm font-medium text-seal">Security</p>
      <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
        The honest trust boundary.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-2">
        Your code is processed inside hardware-isolated enclaves, and we publish proof of the exact
        code that handles it. This page says exactly where the boundary is, including what sits
        outside it.
      </p>

      <section className="mt-14 space-y-4 text-ink-2">
        <p>
          Customer code is plaintext inside two enclaves: our gateway, and the model&rsquo;s
          runtime. The hardware stops the cloud host, Phala staff and our operators from reading
          enclave memory.
        </p>
        <p>
          Our gateway code does handle the plaintext. That&rsquo;s why its source is public and its
          attestation verifiable: a malicious deploy would change the hash. You can check the
          running build yourself on the{' '}
          <Link href="/trust" className="text-seal underline underline-offset-2">
            trust center
          </Link>
          .
        </p>
        <p>
          The developer&rsquo;s machine and the Claude Code client sit outside our boundary. Claude
          Code sends some non-essential traffic to Anthropic unless{' '}
          <code className="font-mono text-sm">CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1</code> is
          set, which our CLI sets. Its WebFetch domain check still calls{' '}
          <code className="font-mono text-sm">api.anthropic.com</code>. If your egress rules block
          that host, set{' '}
          <code className="font-mono text-sm">&quot;skipWebFetchPreflight&quot;: true</code> in your
          Claude Code settings.
        </p>
      </section>

      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Sealcode can see</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">
            {CAN_SEE.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
        <Card className="border-verified/30 bg-verified-soft/40 p-6">
          <h2 className="font-semibold">Sealcode can&rsquo;t see</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">
            {CANNOT_SEE.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="mt-20">
        <h2 className="font-display text-4xl tracking-tight">The request path</h2>
        <ol className="mt-8 space-y-6">
          {PATH.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-1 gap-2 sm:grid-cols-[3rem_1fr]">
              <span className="font-mono text-sm text-seal">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="mt-1 block text-sm text-ink-2">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20">
        <h2 className="font-display text-4xl tracking-tight">Controls</h2>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {CONTROLS.map(([title, body]) => (
            <Card key={title} className="p-6">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-ink-2">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Callout title="Report a vulnerability">
          Email <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a> with details and steps to
          reproduce. We&rsquo;ll acknowledge it and keep you updated as we fix it.
        </Callout>
        <Callout title="Go deeper">
          Read the{' '}
          <a href="https://github.com/factorthr3/sealcode/blob/main/docs/threat-model.md">
            threat model
          </a>{' '}
          and the{' '}
          <a href="https://github.com/factorthr3/sealcode/tree/main/apps/gateway/src">
            gateway source
          </a>
          , or start a <Link href="/contact?reason=security">security review</Link>.
        </Callout>
      </section>
    </div>
  );
}
