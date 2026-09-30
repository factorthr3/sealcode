const NODES = [
  {
    kicker: 'Your machine',
    title: 'Claude Code, OpenCode, Cline or Continue',
    body: 'Unchanged tools. One command points them at Sealcode. Code leaves only over TLS.',
    inside: false,
  },
  {
    kicker: 'Sealcode gateway',
    title: 'Phala Confidential VM · Intel TDX',
    body: 'TLS terminates inside the enclave. Checks your key, limits and budget, and meters tokens. Stores metadata only.',
    inside: true,
  },
  {
    kicker: 'Phala attested gateway',
    title: 'Routes only to verified TEEs',
    body: 'Every call requires aci_verified routing, so there is no fallback to an ordinary GPU. Signs a receipt for each response.',
    inside: true,
  },
  {
    kicker: 'Model enclave',
    title: 'GLM 5.3 on a GPU TEE',
    body: 'Inference runs inside confidential computing hardware with zero data retention.',
    inside: true,
  },
];

function Node({ n, i }: { n: (typeof NODES)[number]; i: number }) {
  return (
    <li className="relative rounded-xl border border-line bg-surface p-5">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
        {String(i + 1).padStart(2, '0')} · {n.kicker}
      </span>
      <p className="mt-2 font-semibold leading-snug">{n.title}</p>
      <p className="mt-2 text-sm text-muted">{n.body}</p>
    </li>
  );
}

/** The request path and the trust boundary: three hops, all inside hardware enclaves. */
export function HowItWorks() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_3.25fr] lg:items-stretch">
        <ol className="grid">
          <Node n={NODES[0]!} i={0} />
        </ol>
        <div className="rounded-2xl border-2 border-dashed border-verified/50 bg-verified-soft/40 p-3 sm:p-4">
          <p className="mb-3 flex items-start gap-2 px-1 font-mono text-[11px] uppercase leading-snug tracking-[0.14em] text-verified">
            <span className="relative mt-1 flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-verified opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-verified" />
            </span>
            Hardware-isolated: host, Phala staff and our operators can&rsquo;t read enclave memory
          </p>
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {NODES.slice(1).map((n, i) => (
              <Node key={n.kicker} n={n} i={i + 1} />
            ))}
          </ol>
        </div>
      </div>
      <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-paper px-4 py-3 text-center font-mono text-xs text-ink-2 sm:flex-row sm:gap-4">
        <span>response streams back unchanged</span>
        <span aria-hidden className="hidden text-muted sm:inline">
          +
        </span>
        <span className="text-ink">x-receipt-id: rcpt-…</span>
        <span aria-hidden className="hidden text-muted sm:inline">
          →
        </span>
        <span>verifiable by you, per request</span>
      </div>
    </div>
  );
}
