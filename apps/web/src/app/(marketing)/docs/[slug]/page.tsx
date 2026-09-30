import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allDocs, getDoc } from '@/lib/docs';

export const dynamicParams = false;

export function generateStaticParams() {
  return allDocs().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<'/docs/[slug]'>): Promise<Metadata> {
  const doc = getDoc((await params).slug);
  return doc ? { title: doc.title, description: doc.summary } : {};
}

export default async function DocPage({ params }: PageProps<'/docs/[slug]'>) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();
  const docs = allDocs();
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[14rem_1fr] lg:py-16">
      <nav aria-label="Docs" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <Link
          href="/docs"
          className="text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink"
        >
          Docs
        </Link>
        <ul className="mt-3 flex gap-1 overflow-x-auto lg:flex-col">
          {docs.map((d) => (
            <li key={d.slug} className="shrink-0">
              <Link
                href={`/docs/${d.slug}`}
                aria-current={d.slug === slug ? 'page' : undefined}
                className={`block rounded-md px-3 py-1.5 text-sm ${d.slug === slug ? 'bg-surface font-medium ring-1 ring-line' : 'text-ink-2 hover:bg-surface-2'}`}
              >
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="min-w-0">
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">{doc.title}</h1>
        <p className="mt-3 text-lg text-ink-2">{doc.summary}</p>
        {/* Rendered from Markdown files in this repository at build time. */}
        <div className="prose-docs mt-10" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </article>
    </div>
  );
}
