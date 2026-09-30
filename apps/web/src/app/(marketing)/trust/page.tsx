import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '@/components/code-block';
import { Badge, ButtonLink, Callout, Card } from '@/components/ui';
import { getAttestation } from '@/lib/attestation';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Trust center',
  description:
    'Live hardware attestation for the Sealcode gateway, and how to check it against our public source code yourself.',
};
export const dynamic = 'force-dynamic';

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`min-w-0 break-all text-sm ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

const CHECKS = [
  [
    'Freshness',
    'The quote’s report data commits to a random nonce you chose, so it can’t be replayed.',
  ],
  [
    'Compose hash',
    'sha256 of the running app-compose.json equals the hash the hardware measured into RTMR3 at boot.',
  ],
  [
    'Event log',
    'Replaying the boot events reproduces RTMR3 exactly, and each event’s payload hashes to its measured digest.',
  ],
  [
    'Published source',
    'The attested docker-compose.yml is identical to the one at the git commit you name.',
  ],
  [
    'Pinned images',
    'Every container image is pinned by sha256 digest, so the compose file fixes the exact code.',
  ],
  [
    'Hardware signature',
    'The quote chains to Intel’s root of trust (via Phala’s public verifier, or locally with dcap-qvl).',
  ],
] as const;

export default async function TrustPage() {
  const a = await getAttestation();
  const { source } = a;
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
      <p className="text-sm font-medium text-seal">Trust center</p>
      <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
        Proof of the exact code that handles your code.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-2">
        Sealcode&rsquo;s gateway, dashboard and database run in one Phala Confidential VM on Intel
        TDX. At boot, the hardware measures the exact container configuration. Anyone can check that
        measurement against our public source, and a deploy that changed the code would change the
        hash.
      </p>

      <Card className="mt-12 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Live attestation</h2>
            {a.mode === 'tee' ? (
              <Badge tone="verified">● Running in a TEE</Badge>
            ) : (
              <Badge tone="warn">Development environment</Badge>
            )}
          </div>
          <span className="font-mono text-xs text-muted">{formatDateTime(a.generatedAt)}</span>
        </div>
        <div className="px-6 py-2">
          {a.mode === 'tee' ? (
            <dl>
              <Row label="App ID" value={a.appId} />
              <Row label="Compose hash" value={a.composeHash} />
              <Row label="OS image hash" value={a.osImageHash} />
              <Row label="RTMR3" value={a.tcb?.rtmr3} />
              <Row label="MRTD" value={a.tcb?.mrtd} />
              <Row label="Key provider" value={a.keyProvider} />
              <Row label="Source commit" value={source.commit} />
            </dl>
          ) : (
            <div className="py-4">
              <Callout tone="warn" title="This environment is not running in a TEE">
                You&rsquo;re looking at a development or staging build, so there is no hardware
                quote to show. On sealcode.dev this panel shows the live measurement of the
                production CVM.
              </Callout>
              <dl className="mt-2">
                <Row label="Source commit" value={source.commit} />
              </dl>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-line bg-surface-2/60 px-6 py-4">
          {a.trustCenterUrl ? (
            <ButtonLink href={a.trustCenterUrl} variant="secondary" size="sm">
              Independent report on Phala Trust Center ↗
            </ButtonLink>
          ) : null}
          <ButtonLink href="/api/attestation" variant="ghost" size="sm" prefetch={false}>
            Raw attestation JSON
          </ButtonLink>
          <ButtonLink href={source.composeUrl} variant="ghost" size="sm">
            docker-compose.yml at this commit ↗
          </ButtonLink>
          <ButtonLink href={source.treeUrl} variant="ghost" size="sm">
            Source at this commit ↗
          </ButtonLink>
        </div>
      </Card>

      <section className="mt-20">
        <h2 className="font-display text-4xl tracking-tight">Verify it yourself</h2>
        <p className="mt-3 max-w-2xl text-ink-2">
          You don&rsquo;t have to take our word or this page&rsquo;s. Clone the repository at the
          commit the attestation names and run the verifier. It sends a fresh random nonce, so the
          quote you check is live.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <CodeBlock
            label="Terminal"
            code={`git clone ${source.repo}.git && cd sealcode
git checkout ${source.commit}
pnpm install
npx tsx scripts/verify-attestation.ts \\
  --site https://sealcode.dev --ref ${source.commit}`}
          />
          <ol className="space-y-4">
            {CHECKS.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-verified-soft font-mono text-xs text-verified">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-sm text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-6 text-sm text-muted">
          For a check that trusts no online service, verify the quote locally with Phala&rsquo;s
          open-source{' '}
          <a className="underline" href="https://github.com/Phala-Network/dcap-qvl">
            dcap-qvl
          </a>{' '}
          and compare the compose hash by hand:{' '}
          <code className="font-mono text-xs">sha256sum app-compose.json</code>.
        </p>
      </section>

      <section className="mt-20 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl tracking-tight">A receipt for every request</h2>
          <p className="mt-3 text-ink-2">
            Our gateway only forwards requests to Phala&rsquo;s attested inference gateway with{' '}
            <code className="font-mono text-xs">aci_verified</code> required, so a request can never
            fall back to a non-TEE route. Every response comes back with a signed receipt recording
            the route, the upstream TEE verification and hashes of the request and response.
          </p>
          <p className="mt-3 text-ink-2">
            Admins can open any request in the audit log and press <strong>Verify</strong> to see{' '}
            <code className="font-mono text-xs">upstream.verified: verified (required)</code> for
            that exact call.
          </p>
        </div>
        <Card className="p-6 font-mono text-xs leading-relaxed">
          <p className="text-muted">{'// receipt event log (abridged)'}</p>
          <p>request.received&nbsp;&nbsp;body_hash sha256:111d…</p>
          <p>route.selected&nbsp;&nbsp;&nbsp;&nbsp;z-ai/glm-5.3</p>
          <p>
            upstream.verified{' '}
            <span className="text-verified">result: verified · required: true</span>
          </p>
          <p>&nbsp;&nbsp;session as_3681…</p>
          <p>response.returned wire_hash sha256:0770…</p>
          <p className="mt-2 text-muted">
            signature: signed by keys bound to the gateway&rsquo;s own attestation
          </p>
        </Card>
      </section>

      <section className="mt-20 grid gap-6 sm:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">What we can and can&rsquo;t see</h2>
          <p className="mt-2 text-sm text-muted">
            The honest trust boundary, including what sits outside it.
          </p>
          <Link
            href="/security"
            className="mt-4 inline-block text-sm font-medium text-seal hover:underline"
          >
            Read the security overview →
          </Link>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Subprocessors and DPA</h2>
          <p className="mt-2 text-sm text-muted">
            Who processes what, where, and our data processing agreement.
          </p>
          <Link
            href="/compliance"
            className="mt-4 inline-block text-sm font-medium text-seal hover:underline"
          >
            Compliance →
          </Link>
        </Card>
      </section>
    </div>
  );
}
