import Link from 'next/link';
import { Logo } from './logo';
import { ButtonLink } from './ui';

const LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/security', label: 'Security' },
  { href: '/trust', label: 'Trust center' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Sealcode home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Start free trial
          </ButtonLink>
        </div>
        <details className="group relative md:hidden">
          <summary
            className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-line"
            aria-label="Menu"
          >
            <span aria-hidden className="text-lg leading-none group-open:hidden">
              ☰
            </span>
            <span aria-hidden className="hidden text-lg leading-none group-open:inline">
              ✕
            </span>
          </summary>
          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block rounded-md px-3 py-2.5 text-sm hover:bg-surface-2"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 grid gap-2 border-t border-line p-2 pt-3">
              <ButtonLink href="/signup">Start free trial</ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                Sign in
              </ButtonLink>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
