import type { Metadata } from 'next';
import Link from 'next/link';
import { allDocs } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'Quickstarts for Claude Code, OpenCode, Cline and Continue, the admin guide and the API reference.',
};

export default function DocsIndex() {
  const docs = allDocs();
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
      <p className="text-sm font-medium text-seal">Docs</p>
      <h1 className="mt-3 font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
        Get your team coding.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-2">
        Most developers need one command:{' '}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-base">
          npx sealcode login
        </code>
        . Everything else is here.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {docs.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/${d.slug}`}
            className="group rounded-2xl border border-line bg-surface p-6 transition hover:border-seal"
          >
            <h2 className="font-semibold group-hover:text-seal">{d.title}</h2>
            <p className="mt-2 text-sm text-muted">{d.summary}</p>
          </Link>
        ))}
        <Link
          href="/trust"
          className="group rounded-2xl border border-line bg-surface p-6 transition hover:border-seal"
        >
          <h2 className="font-semibold group-hover:text-seal">Verify the attestation</h2>
          <p className="mt-2 text-sm text-muted">
            Check that the running gateway matches the published source.
          </p>
        </Link>
        <Link
          href="/security"
          className="group rounded-2xl border border-line bg-surface p-6 transition hover:border-seal"
        >
          <h2 className="font-semibold group-hover:text-seal">Security and data handling</h2>
          <p className="mt-2 text-sm text-muted">
            The trust boundary, the request path and our controls.
          </p>
        </Link>
      </div>
    </div>
  );
}
