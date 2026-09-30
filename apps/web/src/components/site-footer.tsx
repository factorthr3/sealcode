import Link from 'next/link';
import { SALES_EMAIL, SECURITY_EMAIL } from '@sealcode/shared';
import { Logo } from './logo';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/#playground', label: 'Try it live' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/docs', label: 'Docs' },
      { href: '/docs/claude-code', label: 'Claude Code quickstart' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { href: '/security', label: 'Security' },
      { href: '/trust', label: 'Trust center' },
      { href: '/compliance', label: 'Compliance' },
      { href: `mailto:${SECURITY_EMAIL}`, label: 'Report a vulnerability' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/contact', label: 'Contact sales' },
      { href: `mailto:${SALES_EMAIL}`, label: SALES_EMAIL },
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/privacy', label: 'Privacy' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Confidential AI coding, with receipts. Built in the UK for teams with GDPR and FCA
            obligations.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{c.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-ink-2 hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-6 text-xs text-muted sm:px-6">
          <p>
            Claude and Claude Code are trademarks of Anthropic, PBC. Sealcode is not affiliated with
            or endorsed by Anthropic. OpenCode, Cline and Continue are the property of their
            respective owners.
          </p>
          <p>
            © {new Date().getUTCFullYear()} Sealcode. Confidential inference runs on Phala Cloud.
          </p>
        </div>
      </div>
    </footer>
  );
}
